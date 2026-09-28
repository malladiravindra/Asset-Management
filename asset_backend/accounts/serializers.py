from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .fields import IndianPhoneField, NormalizedEmailField

User = get_user_model()


class RegisterSerializer(serializers.Serializer):
    """Used by POST /api/accounts/register/"""
    username = serializers.CharField()
    # Shared field (see accounts/fields.py) so a registered email is
    # normalized the same way as every other email in the project
    # (Employees, Vendors) — previously this stored whatever casing the
    # client sent, unlike those two.
    email = NormalizedEmailField()
    password = serializers.CharField(write_only=True)

    # Generic message for both fields — deliberately doesn't reveal whether
    # it was the username or the email that already exists, to avoid account
    # enumeration (consistent with the anti-enumeration design used by the
    # login and forgot-password flows elsewhere in this app).
    _ALREADY_EXISTS = "Unable to register with the provided details. Please check and try again."

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(self._ALREADY_EXISTS)
        return value

    def validate_email(self, value):
        # The built-in User model does NOT enforce email uniqueness at the
        # DB level (only username is unique=True) — this is the actual
        # duplicate-account check.
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(self._ALREADY_EXISTS)
        return value

    def validate_password(self, value):
        # Same strength validators AUTH_PASSWORD_VALIDATORS already
        # enforces elsewhere (e.g. ResetPasswordView) — no user instance
        # yet at this point, so UserAttributeSimilarityValidator just
        # skips the user-attribute comparison.
        try:
            django_validate_password(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)
        return value


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)


class ResendOTPSerializer(serializers.Serializer):
    """Used by POST /api/accounts/resend-otp/ (forgot-password flow only)."""
    email = NormalizedEmailField()


class PasswordResetRequestSerializer(serializers.Serializer):
    """Used by POST /api/accounts/forgot-password/"""
    email = NormalizedEmailField()


class PasswordResetVerifySerializer(serializers.Serializer):
    """Used by POST /api/accounts/verify-forgot-password-otp/"""
    email = NormalizedEmailField()
    otp = serializers.RegexField(r"^\d{6}$")


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Used by POST /api/accounts/reset-password/

    reset_token is the short-lived authorization issued by
    verify-forgot-password-otp/ after the OTP was confirmed — the raw OTP
    itself is not resubmitted here.
    """
    email = NormalizedEmailField()
    reset_token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)


# ---------------------------------------------------------------- Roles & Permissions


class PermissionSerializer(serializers.ModelSerializer):
    """One entry of the permission catalogue (accounts.roles.CATALOGUE)."""
    app_label = serializers.CharField(source="content_type.app_label", read_only=True)
    model = serializers.CharField(source="content_type.model", read_only=True)

    class Meta:
        model = Permission
        fields = ["id", "app_label", "model", "codename", "name"]


class RoleSerializer(serializers.Serializer):
    """Read shape of a role: a Group plus its RoleProfile. `permissions` is
    the list of catalogue permission ids (resolve names via
    GET /api/accounts/permissions/)."""
    id = serializers.IntegerField(source="pk")
    name = serializers.CharField()
    description = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    user_count = serializers.IntegerField()
    permission_count = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    created_at = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    def _profile(self, group):
        return getattr(group, "role_profile", None)

    def get_description(self, group):
        profile = self._profile(group)
        return profile.description if profile else ""

    def get_is_active(self, group):
        profile = self._profile(group)
        return profile.is_active if profile else True

    def get_permission_count(self, group):
        # Counted from the prefetched Group.permissions rows, not a new query.
        return len(group.permissions.all())

    def get_permissions(self, group):
        return sorted(p.pk for p in group.permissions.all())

    def get_created_by_name(self, group):
        profile = self._profile(group)
        user = profile.created_by if profile else None
        return (user.get_full_name() or user.username) if user else None

    def get_created_at(self, group):
        profile = self._profile(group)
        return profile.created_at.isoformat() if profile else None

    def get_updated_at(self, group):
        profile = self._profile(group)
        return profile.updated_at.isoformat() if profile else None


class RoleWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    permissions = serializers.PrimaryKeyRelatedField(many=True, required=False, queryset=Permission.objects.none())

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from .roles import permission_catalogue

        # Only catalogued permissions can be granted through the API.
        self.fields["permissions"].child_relation.queryset = permission_catalogue()

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Role name cannot be blank.")
        qs = Group.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A role with this name already exists.")
        return value


class UserRoleSummarySerializer(serializers.ModelSerializer):
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = ["id", "name", "is_active"]

    def get_is_active(self, group):
        profile = getattr(group, "role_profile", None)
        return profile.is_active if profile else True


def _employee_summary(user):
    employee = getattr(user, "employee", None)
    if employee is None:
        return None
    return {
        "id": employee.pk,
        "employee_id": employee.employee_id,
        "name": employee.name,
        "phone": employee.phone,
        "designation": employee.designation,
        "department": employee.department_id,
        "department_name": employee.department.name if employee.department_id else None,
        "location": employee.location_id,
        "location_name": employee.location.name if employee.location_id else None,
    }


def display_name(user):
    """One name per person: a linked Employee's organization name wins
    (it's what the rest of the app shows for that person), then the
    account's first/last name, then the username."""
    employee = getattr(user, "employee", None)
    if employee is not None and employee.name:
        return employee.name
    return user.get_full_name().strip() or user.username


class UserSerializer(serializers.ModelSerializer):
    """Read shape for Roles & Permissions > Users. Never includes the
    password hash."""
    display_name = serializers.SerializerMethodField()
    roles = UserRoleSummarySerializer(source="groups", many=True, read_only=True)
    employee = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "display_name", "is_active",
            "is_staff", "is_superuser", "roles", "employee", "last_login", "date_joined",
        ]
        read_only_fields = fields

    def get_display_name(self, user):
        return display_name(user)

    def get_employee(self, user):
        return _employee_summary(user)


class UserRolesWriteSerializer(serializers.Serializer):
    roles = serializers.PrimaryKeyRelatedField(many=True, queryset=Group.objects.select_related("role_profile"))


# ---------------------------------------------------------------- Profile (/me)


def me_payload(user):
    """The single current-user document (GET/PATCH /api/accounts/me/):
    identity from User, organization profile from the linked Employee,
    roles from User.groups and effective permissions as Django computes
    them (inactive roles excluded — see accounts.backends)."""
    return {
        "user": {
            "id": user.pk,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "display_name": display_name(user),
            "is_active": user.is_active,
            "is_staff": user.is_staff,
            "is_superuser": user.is_superuser,
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "date_joined": user.date_joined.isoformat() if user.date_joined else None,
        },
        "employee": _employee_summary(user),
        "roles": UserRoleSummarySerializer(user.groups.select_related("role_profile"), many=True).data,
        "permissions": sorted(user.get_all_permissions()),
    }


class MeUpdateSerializer(serializers.Serializer):
    """Fields a user may change on their own profile — nothing else is
    accepted (roles, permissions, staff flags, username, employee link and
    HR-owned employee fields are not writable here).

    Name ownership: when the account is linked to an Employee, the person's
    name is the Employee.name managed in Organization > Employees, so
    first_name/last_name are rejected to avoid two competing names. Phone
    lives only on Employee, so it is writable only when linked."""
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = NormalizedEmailField(required=False)
    phone = IndianPhoneField(required=False)

    def validate(self, attrs):
        user = self.instance
        employee = getattr(user, "employee", None)
        errors = {}
        if employee is not None:
            for field in ("first_name", "last_name"):
                if field in attrs:
                    errors[field] = "Your name comes from your employee record; ask an administrator to change it."
        elif "phone" in attrs:
            errors["phone"] = "Phone is stored on your employee record, and this account is not linked to one."
        if "email" in attrs and User.objects.filter(email__iexact=attrs["email"]).exclude(pk=user.pk).exists():
            # Same generic wording as registration — no account enumeration.
            errors["email"] = "This email address can't be used."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        if attrs["new_password"] == attrs["current_password"]:
            raise serializers.ValidationError({"new_password": "Choose a password different from your current one."})
        try:
            django_validate_password(attrs["new_password"], user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": error.messages})
        return attrs
