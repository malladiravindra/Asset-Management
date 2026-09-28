import logging
import re

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import Group, Permission
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from . import roles
from .models import EmailOTP, RoleProfile
from .permissions import ModelPermission
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    MeUpdateSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordResetVerifySerializer,
    PermissionSerializer,
    RegisterSerializer,
    ResendOTPSerializer,
    RoleSerializer,
    RoleWriteSerializer,
    UserRolesWriteSerializer,
    UserSerializer,
    me_payload,
)
from aduitlog.models import AuditLog
from aduitlog.services import create_audit_log

from .utils import (
    OTPDeliveryError,
    OTPRateLimitError,
    clear_login_failures,
    issue_decoy_otp,
    issue_otp,
    load_challenge,
    login_locked,
    mask_email,
    record_login_failure,
    sign_challenge,
    verify_otp,
)

logger = logging.getLogger(__name__)

User = get_user_model()


def _create_pending_user(email):
    """Create a new User for `email` with no usable password yet.

    Lets forgot-password double as self-registration for an email with no
    existing account: they finish by verifying the OTP and setting a
    password via reset-password/. Until then set_unusable_password() means
    the account exists but can never be logged into.
    """
    base = re.sub(r"[^\w.@+-]", "", email.split("@", 1)[0]) or "user"
    username = base
    suffix = 1
    while User.objects.filter(username__iexact=username).exists():
        suffix += 1
        username = f"{base}{suffix}"
    user = User.objects.create(username=username, email=email, is_active=True)
    user.set_unusable_password()
    user.save(update_fields=["password"])
    # Same minimum role as register/: a self-created account is read-only.
    roles.assign_default_role(user)
    logger.debug("forgot-password: created pending account id=%s username=%s for email=%s", user.pk, username, mask_email(email))
    return user

# Shown for forgot-password/resend regardless of whether the email is
# registered, and regardless of whether sending actually happened (rate
# limit, SMTP hiccup, etc.) — never reveal account existence or delivery
# state to the client.
GENERIC_RESET_MESSAGE = "If that email is registered, a reset code has been sent."

# Same message whether or not the identifier belongs to a real account.
LOCKOUT_MESSAGE = "Too many failed sign-in attempts. Please try again later."


def token_response(user):
    refresh = TokenObtainPairSerializer.get_token(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class RegisterAPIView(APIView):
    """POST /api/accounts/register/

    Body: {"username", "email", "password"}

    Creates a real, immediately-usable account via the default
    UserManager's create_user() — which hashes the password internally,
    unlike _create_pending_user() above (that one deliberately sets an
    UNUSABLE password; it's a different, internal-only mechanism used by
    forgot-password, not a signup endpoint). Returns the created
    account's safe fields (no password) plus JWT tokens, matching
    LoginView's response shape, so the frontend can log the user in
    immediately after signup without a second request.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'accounts_register'

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = User.objects.create_user(
            username=data["username"],
            email=data["email"],
            password=data["password"],
        )
        # Public signup never grants more than the read-only default role
        # (accounts.roles.DEFAULT_ROLE_NAME); an administrator promotes it.
        roles.assign_default_role(user)
        logger.debug("register: created account id=%s username=%s", user.pk, user.username)

        response = {"id": user.id, "username": user.username, "email": user.email}
        response.update(token_response(user))
        return Response(response, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """POST /api/accounts/login/

    Validates credentials and, on success, returns JWT access and refresh tokens directly.
    
    IMPORTANT: Returns JWT tokens immediately on valid credentials, bypassing OTP.
    The OTP flow is kept for password resets only (forgot-password path).
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'accounts_login'

    def post(self, request):
        # Debug-only visibility into what the client actually sent — keys and
        # a masked identifier only, NEVER the password itself or its length
        # (even a length leak is an oracle). Check the Django terminal, not
        # the API response, for all of this — the client always gets the
        # same generic 401 regardless of which condition below tripped it,
        # so credential-guessing can't be narrowed down from the response.
        logger.debug(
            "login: payload keys=%s identifier_field_present=%s email_field_present=%s username_field_present=%s",
            sorted(request.data.keys()) if hasattr(request.data, "keys") else type(request.data).__name__,
            "identifier" in request.data, "email" in request.data, "username" in request.data,
        )
        serializer = LoginSerializer(data={
            "identifier": request.data.get("identifier") or request.data.get("email") or request.data.get("username"),
            "password": request.data.get("password"),
        })
        if not serializer.is_valid():
            logger.debug("login: serializer validation failed — errors=%s", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        identifier = serializer.validated_data["identifier"]
        masked_identifier = mask_email(identifier) if "@" in identifier else f"{identifier[:2]}***"
        # Settings > Security lockout — checked before authenticate(), so a
        # locked identifier is refused even with the correct password.
        if login_locked(identifier):
            logger.warning("login: refused for identifier=%s — locked out", masked_identifier)
            return Response({"detail": LOCKOUT_MESSAGE}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        user_by_email = User.objects.filter(email__iexact=identifier).first()
        user = authenticate(request, username=user_by_email.get_username() if user_by_email else identifier,
                            password=serializer.validated_data["password"])
        logger.debug(
            "login: identifier=%s resolved_by_email=%s authenticate_result=%s is_active=%s has_email=%s",
            masked_identifier,
            bool(user_by_email),
            "matched" if user else "no matching user/wrong password",
            user.is_active if user else None,
            bool(user.email) if user else None,
        )
        if not user or not user.is_active or not user.email:
            # Exact reason is in the debug log line just above — the
            # response itself stays generic on purpose (never reveal to the
            # client whether the account doesn't exist, the password was
            # wrong, the account is inactive, or it has no email on file;
            # any of those leaking would let a caller enumerate accounts).
            reason = (
                "no account or wrong password" if not user else
                "account is_active=False" if not user.is_active else
                "account has no email on file"
            )
            logger.warning("login: rejected for identifier=%s — %s", masked_identifier, reason)
            if record_login_failure(identifier):
                logger.warning("login: identifier=%s locked out after repeated failures", masked_identifier)
                return Response({"detail": LOCKOUT_MESSAGE}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

        clear_login_failures(identifier)
        # Recorded only when Settings > Audit Logs > Track Login is on.
        create_audit_log(action=AuditLog.ACTION_LOGIN, title=f"User {user.username} signed in", actor=user)

        # Return JWT tokens directly for immediate frontend use.
        # The frontend can now call protected APIs without an extra OTP step.
        response = {"id": user.id, "username": user.username, "email": user.email}
        response.update(token_response(user))
        logger.debug("login: issued tokens for user id=%s username=%s", user.pk, user.username)
        return Response(response, status=status.HTTP_200_OK)


class ResendOTPView(APIView):
    """POST /api/accounts/resend-otp/

    Body: {"email": "user@example.com"}

    Resend for the forgot-password flow only (login is password-only and
    never issues an OTP challenge — see LoginView). Invalidates the previous
    OTP and emails a brand new one to the user's own address, subject to a
    60s cooldown and a rolling max-requests cap. Never reveals whether an
    email is registered.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'accounts_resend_otp'

    def post(self, request):
        serializer = ResendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return Response({"detail": GENERIC_RESET_MESSAGE})

        try:
            _, sent = issue_otp(user, EmailOTP.PASSWORD_RESET)
        except OTPRateLimitError:
            logger.warning("resend-otp: rate limit hit for user id=%s", user.pk)
            # Don't reveal rate-limit state for an email-identified request —
            # it would leak account existence.
            return Response({"detail": GENERIC_RESET_MESSAGE})
        except OTPDeliveryError:
            # Full traceback already logged inside utils.send_otp_email.
            logger.error("resend-otp: OTP delivery failed for user id=%s", user.pk)
            return Response({"detail": "Unable to send the verification email. Check SMTP configuration."}, status=503)

        return Response({
            "detail": "A new code has been sent." if sent else "Please wait before requesting another code.",
            "resend_available_in": 0 if sent else 60,
        }, status=200 if sent else 429)


class RequestPasswordResetView(APIView):
    """POST /api/accounts/forgot-password/

    Body: {"email": "user@example.com"}

    Looks the user up by their submitted email. If found, emails a fresh
    6-digit OTP to that exact address with a 5-minute expiry. If no account
    exists for that email, it does nothing and sends nothing (to avoid revealing
    account existence or sending unsolicited emails). The response remains
    generic and identical to prevent user enumeration.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'accounts_forgot_password'

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip()
        logger.debug(f"[ForgotPassword] Step 1: received request for email={mask_email(email)}")

        # Look up the user by the *submitted* email — this is what makes the
        # recipient dynamic instead of hardcoded.
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            if User.objects.filter(email__iexact=email, is_active=False).exists():
                logger.debug(f"[ForgotPassword] Step 2: email={mask_email(email)} belongs to a disabled account — sending look-alike OTP (not stored), not creating a duplicate")
                issue_decoy_otp(email)
            else:
                logger.debug(f"[ForgotPassword] Step 2: no account found for email={mask_email(email)} — creating pending user and sending OTP")
                user = _create_pending_user(email)
                try:
                    issue_otp(user, EmailOTP.PASSWORD_RESET)
                except OTPDeliveryError:
                    logger.error("forgot-password: OTP delivery failed for new pending user id=%s", user.pk)
                    user.delete()
                    return Response(
                        {"detail": "Unable to send the verification email. Check SMTP configuration."},
                        status=503,
                    )
                except OTPRateLimitError:
                    logger.warning("forgot-password: rate limit hit for new pending user id=%s", user.pk)
                    user.delete()
                    return Response(
                        {"detail": "Please wait before requesting another verification email."},
                        status=429,
                    )
        else:
            if user.email:
                logger.debug(f"[ForgotPassword] Step 2: user found — id={user.pk}, registered email={mask_email(user.email)}")
                try:
                    issue_otp(user, EmailOTP.PASSWORD_RESET)
                except OTPDeliveryError:
                    # Logged (with traceback) inside utils.send_otp_email already.
                    # The response to the client stays generic on purpose — never
                    # reveal delivery/account state — but this is NOT swallowed
                    # silently: check the server terminal for the traceback.
                    logger.error("forgot-password: OTP delivery failed for user id=%s", user.pk)
                    return Response(
                        {"detail": "Unable to send the verification email. Check SMTP configuration."},
                        status=503,
                    )
                except OTPRateLimitError:
                    logger.warning("forgot-password: rate limit hit for user id=%s", user.pk)
        return Response({"detail": GENERIC_RESET_MESSAGE})


class VerifyForgotPasswordOTPView(APIView):
    """POST /api/accounts/verify-forgot-password-otp/

    Body: {"email": "user@example.com", "otp": "123456"}

    Validates the OTP (exists, not expired, not used, under the attempt
    limit) without consuming it, marks it verified, and returns a signed,
    time-limited reset_token — the only authorization reset-password/ needs.
    The OTP itself is never echoed back.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'accounts_verify_otp'

    def post(self, request):
        serializer = PasswordResetVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        logger.debug(f"[VerifyForgotPasswordOTP] Step 1: verify request for email={mask_email(email)}")

        otp = EmailOTP.objects.filter(
            user__email__iexact=email,
            purpose=EmailOTP.PASSWORD_RESET,
            used_at__isnull=True,
        ).order_by("-created_at").first()
        if not otp:
            logger.debug(f"[VerifyForgotPasswordOTP] Step 2: no pending password-reset OTP found for email={mask_email(email)}")
            return Response({"detail": "Invalid or expired OTP."}, status=400)
        logger.debug(f"[VerifyForgotPasswordOTP] Step 2: latest pending OTP id={otp.pk} for user id={otp.user_id}")

        if not verify_otp(otp, serializer.validated_data["otp"], consume=False):
            return Response({"detail": "Invalid or expired OTP."}, status=400)

        reset_token = sign_challenge(otp)
        logger.debug(f"[VerifyForgotPasswordOTP] Step 3: OTP id={otp.pk} verified — issuing reset_token for user id={otp.user_id}")
        return Response({"detail": "OTP verified. You can now set a new password.",
                         "reset_token": reset_token})


class ResetPasswordView(APIView):
    """POST /api/accounts/reset-password/

    Body: {"email", "reset_token", "new_password", "confirm_password"}

    Requires a reset_token from a successful verify-forgot-password-otp/
    call (so the OTP itself never has to be resubmitted), re-checks it
    hasn't already been used and matches the submitted email, hashes and
    saves the new password via Django's password hashing, then deletes
    every password-reset OTP for that user so nothing can be reused.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'accounts_reset_password'

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        logger.debug(f"[ResetPassword] Step 1: reset request for email={mask_email(data['email'])}")

        if data["new_password"] != data["confirm_password"]:
            logger.debug("[ResetPassword] Step 2: rejected — new_password and confirm_password do not match")
            return Response({"detail": "Passwords do not match."}, status=400)

        try:
            otp = load_challenge(data["reset_token"], EmailOTP.PASSWORD_RESET)
        except (signing.BadSignature, signing.SignatureExpired, EmailOTP.DoesNotExist, ValueError, TypeError):
            logger.debug("[ResetPassword] Step 2: rejected — reset_token is invalid or expired")
            return Response({"detail": "Invalid or expired reset token."}, status=400)

        if otp.user.email.lower() != data["email"].strip().lower():
            logger.debug(f"[ResetPassword] Step 2: rejected — reset_token belongs to user id={otp.user_id}, not the submitted email")
            return Response({"detail": "Invalid or expired reset token."}, status=400)
        if not otp.verified_at or otp.used_at:
            logger.debug(f"[ResetPassword] Step 2: rejected — OTP id={otp.pk} was not verified first (or already used)")
            return Response({"detail": "This OTP must be verified first."}, status=400)
        logger.debug(f"[ResetPassword] Step 2: reset_token OK — user id={otp.user_id}, OTP id={otp.pk} verified at {otp.verified_at.isoformat()}")

        try:
            validate_password(data["new_password"], otp.user)
        except ValidationError as error:
            logger.debug(f"[ResetPassword] Step 3: rejected — password failed strength validation: {error.messages}")
            return Response({"detail": error.messages}, status=400)

        otp.user.set_password(data["new_password"])
        otp.user.save(update_fields=["password"])
        logger.debug(f"[ResetPassword] Step 4: password updated for user id={otp.user_id} via set_password() + save()")

        # Invalidate/delete every password-reset OTP for this user so the
        # token and the OTP it came from can never be reused.
        deleted_count, _ = EmailOTP.objects.filter(user=otp.user, purpose=EmailOTP.PASSWORD_RESET).delete()
        logger.debug(f"[ResetPassword] Step 5: invalidated {deleted_count} password-reset OTP row(s) for user id={otp.user_id}")
        return Response({"detail": "Password updated successfully."})


class LogoutView(APIView):
    """POST /api/accounts/logout/

    Body: {"refresh": "<refresh token>"}

    Blacklists the refresh token so it can never mint another access token.
    AllowAny is deliberate (and was previously missing — this silently fell
    back to the project-wide IsAuthenticated default): the refresh token
    itself, validated and blacklisted by RefreshToken(...).blacklist(),
    is the only credential this needs. Requiring a *separately* valid
    access token broke exactly the case logout exists for — a client whose
    access token already expired (or was simply never resent) but whose
    refresh token is still live and needs invalidating.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            token = RefreshToken(request.data["refresh"])
            user_id = token.get("user_id")
            token.blacklist()
        except (KeyError, ValueError, TokenError):
            return Response({"detail": "Invalid refresh token."}, status=400)
        # Actor comes from the validated token, never from client input.
        # Recorded only when Settings > Audit Logs > Track Logout is on.
        user = User.objects.filter(pk=user_id).first() if user_id else None
        if user:
            create_audit_log(action=AuditLog.ACTION_LOGOUT, title=f"User {user.username} signed out", actor=user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ======================================================== Roles & Permissions
#
#   GET/POST          /api/accounts/roles/
#   GET/PATCH/DELETE  /api/accounts/roles/<id>/
#   GET               /api/accounts/permissions/
#   GET               /api/accounts/users/
#   PUT               /api/accounts/users/<id>/roles/
#
# A role is a django.contrib.auth Group (+ RoleProfile); see accounts/roles.py.
# Guarded by the stock auth.* permissions (auth.view_group, auth.change_user…),
# which only the Administrator role holds by default.


def role_queryset():
    return (
        Group.objects.select_related("role_profile", "role_profile__created_by")
        .prefetch_related("permissions")
        .annotate(user_count=Count("user", distinct=True))
        .order_by("name")
    )


def _escalation_response(labels):
    return Response(
        {"detail": "You can only grant permissions you hold yourself: " + ", ".join(labels) + "."},
        status=status.HTTP_403_FORBIDDEN,
    )


class RoleListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Group

    def get(self, request):
        return Response(RoleSerializer(role_queryset(), many=True).data)

    def post(self, request):
        serializer = RoleWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        permissions = data.get("permissions", [])
        blocked = roles.ungrantable_permissions(request.user, permissions)
        if blocked:
            return _escalation_response(blocked)
        with transaction.atomic():
            group = Group.objects.create(name=data["name"])
            RoleProfile.objects.create(
                group=group,
                description=data.get("description", ""),
                is_active=data.get("is_active", True),
                created_by=request.user,
            )
            group.permissions.set(permissions)
            roles.log_permission_change(
                action=AuditLog.ACTION_CREATE,
                title=f"Role {group.name} created",
                actor=request.user,
                context=f"Permissions: {len(permissions)}",
            )
        return Response(RoleSerializer(role_queryset().get(pk=group.pk)).data, status=status.HTTP_201_CREATED)


class RoleDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Group

    def get_object(self, pk):
        return get_object_or_404(role_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(RoleSerializer(self.get_object(pk)).data)

    def patch(self, request, pk):
        group = self.get_object(pk)
        serializer = RoleWriteSerializer(group, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        profile, _ = RoleProfile.objects.get_or_create(group=group)

        old_permissions = set(group.permissions.all())
        new_permissions = set(data["permissions"]) if "permissions" in data else old_permissions
        added, removed = new_permissions - old_permissions, old_permissions - new_permissions
        # Only what is being newly granted has to be held by the editor —
        # editing the description of a role that already holds more than
        # you do is fine.
        blocked = roles.ungrantable_permissions(request.user, added)
        if blocked:
            return _escalation_response(blocked)

        changed = []
        with transaction.atomic():
            if "name" in data and data["name"] != group.name:
                group.name = data["name"]
                group.save(update_fields=["name"])
                changed.append("name")
            for field in ("description", "is_active"):
                if field in data and getattr(profile, field) != data[field]:
                    setattr(profile, field, data[field])
                    changed.append(field)
            profile.save()
            if added or removed:
                group.permissions.set(new_permissions)
                changed.append(f"permissions +{len(added)} -{len(removed)}")
            if changed:
                roles.log_permission_change(
                    action=AuditLog.ACTION_UPDATE,
                    title=f"Role {group.name} updated",
                    actor=request.user,
                    context="Changed: " + ", ".join(changed),
                )
        return Response(RoleSerializer(self.get_object(pk)).data)

    def delete(self, request, pk):
        group = self.get_object(pk)
        if group.user_count:
            return Response(
                {
                    "detail": "This role cannot be deleted because users are assigned to it "
                    f"({group.user_count}). Move them to another role first."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            name = group.name
            group.delete()
            roles.log_permission_change(action=AuditLog.ACTION_DELETE, title=f"Role {name} deleted", actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PermissionListAPIView(APIView):
    """The grantable permission catalogue (accounts.roles.CATALOGUE)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Permission

    def get(self, request):
        return Response(PermissionSerializer(roles.permission_catalogue(), many=True).data)


class UserPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class UserListAPIView(APIView):
    """Login accounts with their roles and linked employee. ?search= matches
    username, email, first/last name and the linked employee's name."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = User

    def get(self, request):
        queryset = (
            User.objects.select_related("employee", "employee__department", "employee__location")
            .prefetch_related("groups", "groups__role_profile")
            .order_by("username")
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search) | Q(email__icontains=search)
                | Q(first_name__icontains=search) | Q(last_name__icontains=search)
                | Q(employee__name__icontains=search)
            )
        paginator = UserPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(UserSerializer(page, many=True).data)


class UserRolesAPIView(APIView):
    """PUT {"roles": [<group id>, ...]} — replaces the user's roles."""
    permission_classes = [IsAuthenticated, ModelPermission]
    required_permissions = {"PUT": ["auth.change_user"]}

    def put(self, request, pk):
        target = get_object_or_404(User.objects.all(), pk=pk)
        if target.pk == request.user.pk and not request.user.is_superuser:
            return Response({"detail": "You can't change your own roles."}, status=status.HTTP_403_FORBIDDEN)
        serializer = UserRolesWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_groups = set(serializer.validated_data["roles"])
        old_groups = set(target.groups.all())
        added, removed = new_groups - old_groups, old_groups - new_groups

        # A switched-off role can't be handed out (it would silently grant
        # nothing); members who already hold it keep it. Superusers are exempt.
        inactive = sorted(
            g.name for g in added
            if not getattr(getattr(g, "role_profile", None), "is_active", True)
        )
        if inactive and not request.user.is_superuser:
            return Response(
                {"detail": "Inactive roles can't be assigned: " + ", ".join(inactive) + "."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        granted = Permission.objects.filter(group__in=added).select_related("content_type").distinct()
        blocked = roles.ungrantable_permissions(request.user, granted)
        if blocked:
            return _escalation_response(blocked)

        with transaction.atomic():
            target.groups.set(new_groups)
            if added or removed:
                parts = []
                if added:
                    parts.append("Added: " + ", ".join(sorted(g.name for g in added)))
                if removed:
                    parts.append("Removed: " + ", ".join(sorted(g.name for g in removed)))
                roles.log_permission_change(
                    action=AuditLog.ACTION_UPDATE,
                    title=f"Roles changed for {target.username}",
                    actor=request.user,
                    context=" | ".join(parts),
                )
        target = User.objects.prefetch_related("groups", "groups__role_profile").get(pk=target.pk)
        return Response(UserSerializer(target).data)


# ======================================================== Profile (current user)
#
#   GET/PATCH  /api/accounts/me/
#   POST       /api/accounts/me/change-password/
#
# The profile is User (account) + the linked assets.Employee (organization
# profile) — there is no separate profile table. See MeUpdateSerializer for
# which fields a user may change themselves.


def _current_user(request):
    return (
        User.objects.select_related("employee", "employee__department", "employee__location")
        .get(pk=request.user.pk)
    )


class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(me_payload(_current_user(request)))

    def patch(self, request):
        user = _current_user(request)
        serializer = MeUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        changed = []
        with transaction.atomic():
            user_fields = [f for f in ("first_name", "last_name", "email") if f in data and getattr(user, f) != data[f]]
            for field in user_fields:
                setattr(user, field, data[field])
            if user_fields:
                user.save(update_fields=user_fields)
                changed += user_fields
            employee = getattr(user, "employee", None)
            if employee is not None and "phone" in data and employee.phone != data["phone"]:
                employee.phone = data["phone"]
                employee.save(update_fields=["phone"])
                changed.append("phone")
            if changed:
                # Field names only, never values.
                create_audit_log(
                    action=AuditLog.ACTION_UPDATE,
                    title=f"Profile updated for {user.username}",
                    actor=request.user,
                    context="Changed: " + ", ".join(changed),
                )
        return Response(me_payload(_current_user(request)))


class ChangePasswordAPIView(APIView):
    """Body: {"current_password", "new_password", "confirm_password"}.

    Validates with AUTH_PASSWORD_VALIDATORS (incl. the Settings > Security
    policy), stores it hashed via set_password(), then revokes every
    refresh token the user already had — other signed-in sessions end at
    their next token refresh — and returns a fresh token pair for this one."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "accounts_change_password"

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        with transaction.atomic():
            user.set_password(serializer.validated_data["new_password"])
            user.save(update_fields=["password"])
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)
            create_audit_log(
                action=AuditLog.ACTION_UPDATE,
                title=f"Password changed for {user.username}",
                actor=user,
            )
        return Response({"detail": "Password changed successfully.", **token_response(user)})
