import re

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.test import APISimpleTestCase, APITestCase

from .fields import IndianPhoneField, NormalizedEmailField
from .roles import ROLE_VIEWER
from .testing import grant_role
from .models import EmailOTP
from .validators import normalize_email, normalize_indian_phone

OTP_RE = re.compile(r"\b(\d{6})\b")


class RegisterEmailNormalizationTests(APITestCase):
    """POST /api/accounts/register/ — confirms the email goes through the
    same shared normalization as Employees/Vendors (see
    accounts.fields.NormalizedEmailField), instead of being stored with
    whatever casing/whitespace the client happened to send."""

    def test_email_is_trimmed_and_lowercased(self):
        response = self.client.post(
            "/api/accounts/register/",
            {"username": "newuser", "email": "  New.User@Example.COM  ", "password": "S0meStr0ngPass!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["email"], "new.user@example.com")
        user = User.objects.get(username="newuser")
        self.assertEqual(user.email, "new.user@example.com")

    def test_rejects_invalid_email_format(self):
        response = self.client.post(
            "/api/accounts/register/",
            {"username": "baduser", "email": "not-an-email", "password": "S0meStr0ngPass!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)


class NormalizeEmailTests(TestCase):
    def test_trims_and_lowercases(self):
        self.assertEqual(normalize_email("  User@Example.COM  "), "user@example.com")

    def test_none_passes_through(self):
        self.assertIsNone(normalize_email(None))

    def test_already_normalized_is_unchanged(self):
        self.assertEqual(normalize_email("user@example.com"), "user@example.com")


class NormalizeIndianPhoneTests(TestCase):
    def test_bare_ten_digits_unchanged(self):
        self.assertEqual(normalize_indian_phone("9876543210"), "9876543210")

    def test_strips_plus91_prefix(self):
        self.assertEqual(normalize_indian_phone("+919876543210"), "9876543210")

    def test_strips_plus91_prefix_with_spaces(self):
        self.assertEqual(normalize_indian_phone("+91 98765 43210"), "9876543210")

    def test_strips_bare_91_prefix_at_length_12(self):
        self.assertEqual(normalize_indian_phone("919876543210"), "9876543210")

    def test_strips_leading_trunk_zero_at_length_11(self):
        self.assertEqual(normalize_indian_phone("09876543210"), "9876543210")

    def test_strips_dashes_and_parens(self):
        self.assertEqual(normalize_indian_phone("(987) 654-3210"), "9876543210")

    def test_blank_passes_through(self):
        self.assertEqual(normalize_indian_phone(""), "")
        self.assertEqual(normalize_indian_phone(None), "")

    def test_rejects_too_short(self):
        with self.assertRaises(drf_serializers.ValidationError):
            normalize_indian_phone("98765")

    def test_rejects_too_long(self):
        with self.assertRaises(drf_serializers.ValidationError):
            normalize_indian_phone("987654321099")

    def test_rejects_alphabetic(self):
        with self.assertRaises(drf_serializers.ValidationError):
            normalize_indian_phone("98ABC43210")

    def test_a_bare_number_that_happens_to_start_with_91_is_not_mis_stripped(self):
        # 10 digits starting with "91" — must NOT be treated as a country
        # code (that only applies at length 12); stripping it here would
        # wrongly leave only 8 digits.
        self.assertEqual(normalize_indian_phone("9198765432"), "9198765432")


class SharedFieldTests(APISimpleTestCase):
    """Confirms the DRF field wrappers apply the same normalization when
    used inside a serializer (not just calling the bare functions)."""

    def test_normalized_email_field_lowercases(self):
        field = NormalizedEmailField()
        self.assertEqual(field.run_validation("  Test@Example.COM  "), "test@example.com")

    def test_indian_phone_field_normalizes(self):
        field = IndianPhoneField()
        self.assertEqual(field.run_validation("+91 98765 43210"), "9876543210")

    def test_indian_phone_field_rejects_invalid(self):
        field = IndianPhoneField()
        with self.assertRaises(drf_serializers.ValidationError):
            field.run_validation("12345")

    def test_indian_phone_field_allows_blank_when_configured(self):
        field = IndianPhoneField(required=False, allow_blank=True)
        self.assertEqual(field.run_validation(""), "")


class LoginFlowTests(APITestCase):
    """POST /api/accounts/login/ + JWT-protected access + token refresh.

    Never previously covered by a test — these assert actual behavior
    (status codes, token shape, that a returned access token really is
    accepted by a protected endpoint) rather than just that the URL
    resolves.
    """

    def setUp(self):
        # Fresh throttle counters per test — LocMemCache persists across
        # test methods within one run, and accounts_login is rate-limited
        # (see REST_FRAMEWORK.DEFAULT_THROTTLE_RATES).
        cache.clear()
        self.user = User.objects.create_user(
            username="loginuser", email="login.user@example.com", password="Str0ngPass!2025",
        )
        # The protected endpoint used below needs catalog.view_category.
        grant_role(self.user, ROLE_VIEWER)

    def test_valid_login_returns_tokens(self):
        response = self.client.post(
            "/api/accounts/login/",
            {"identifier": "login.user@example.com", "password": "Str0ngPass!2025"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["username"], "loginuser")

    def test_wrong_password_returns_401_generic(self):
        response = self.client.post(
            "/api/accounts/login/",
            {"identifier": "login.user@example.com", "password": "WrongPassword!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn("access", response.data)

    def test_nonexistent_user_returns_401(self):
        response = self.client.post(
            "/api/accounts/login/",
            {"identifier": "nobody@example.com", "password": "whatever123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_user_returns_401(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        response = self.client.post(
            "/api/accounts/login/",
            {"identifier": "login.user@example.com", "password": "Str0ngPass!2025"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_password_returns_400(self):
        response = self.client.post(
            "/api/accounts/login/", {"identifier": "login.user@example.com"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_identifier_returns_400(self):
        response = self.client.post(
            "/api/accounts/login/", {"password": "Str0ngPass!2025"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_access_token_grants_protected_endpoint(self):
        login = self.client.post(
            "/api/accounts/login/",
            {"identifier": "login.user@example.com", "password": "Str0ngPass!2025"},
            format="json",
        )
        access = login.data["access"]

        # Without a token, a real IsAuthenticated endpoint must reject.
        unauthenticated = self.client.get("/api/catalog/categories/")
        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED)

        # With the token this login just issued, the same endpoint must work.
        authenticated = self.client.get(
            "/api/catalog/categories/", HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(authenticated.status_code, status.HTTP_200_OK)

    def test_token_refresh_issues_new_access_token(self):
        login = self.client.post(
            "/api/accounts/login/",
            {"identifier": "login.user@example.com", "password": "Str0ngPass!2025"},
            format="json",
        )
        refresh_token = login.data["refresh"]

        refreshed = self.client.post(
            "/api/accounts/token/refresh/", {"refresh": refresh_token}, format="json",
        )
        self.assertEqual(refreshed.status_code, status.HTTP_200_OK, refreshed.data)
        self.assertIn("access", refreshed.data)

        # The new access token must itself work against a protected endpoint.
        response = self.client.get(
            "/api/catalog/categories/", HTTP_AUTHORIZATION=f"Bearer {refreshed.data['access']}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class LogoutTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="logoutuser", email="logout.user@example.com", password="Str0ngPass!2025",
        )

    def test_logout_blacklists_refresh_token(self):
        login = self.client.post(
            "/api/accounts/login/",
            {"identifier": "logout.user@example.com", "password": "Str0ngPass!2025"},
            format="json",
        )
        refresh_token = login.data["refresh"]

        logout = self.client.post("/api/accounts/logout/", {"refresh": refresh_token}, format="json")
        self.assertEqual(logout.status_code, status.HTTP_204_NO_CONTENT)

        # The blacklisted refresh token must no longer mint a new access token.
        refreshed = self.client.post(
            "/api/accounts/token/refresh/", {"refresh": refresh_token}, format="json",
        )
        self.assertEqual(refreshed.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_with_invalid_token_returns_400(self):
        response = self.client.post("/api/accounts/logout/", {"refresh": "not-a-real-token"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_with_missing_token_returns_400(self):
        response = self.client.post("/api/accounts/logout/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ForgotPasswordOTPFlowTests(APITestCase):
    """Full password-reset OTP cycle, start to finish, against the real
    EmailOTP model and the real (locmem-backed, per Django's test runner)
    email backend — nothing here is mocked. Covers generation, storage
    (hashed), delivery to the correct recipient, verification, expiry,
    reuse-prevention, and the final password change actually taking effect.
    """

    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        self.user = User.objects.create_user(
            username="resetuser", email="reset.user@example.com", password="OldPass!2025",
        )

    def _request_otp(self, email="reset.user@example.com"):
        response = self.client.post("/api/accounts/forgot-password/", {"email": email}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response

    def _extract_otp_from_last_email(self):
        self.assertGreaterEqual(len(mail.outbox), 1)
        sent = mail.outbox[-1]
        match = OTP_RE.search(sent.body)
        self.assertIsNotNone(match, "no 6-digit OTP found in the sent email body")
        return match.group(1)

    def test_full_forgot_password_flow_success(self):
        self._request_otp()
        # OTP must be delivered to the affected user's own address, never
        # to some other/sender address.
        self.assertEqual(mail.outbox[-1].to, ["reset.user@example.com"])
        # The OTP must never be stored in plaintext.
        otp_row = EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.PASSWORD_RESET).latest("created_at")
        code = self._extract_otp_from_last_email()
        self.assertNotEqual(otp_row.code_hash, code)

        verify = self.client.post(
            "/api/accounts/verify-forgot-password-otp/",
            {"email": "reset.user@example.com", "otp": code},
            format="json",
        )
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        reset_token = verify.data["reset_token"]
        # The OTP itself must never be echoed back to the client.
        self.assertNotIn(code, str(verify.data))

        reset = self.client.post(
            "/api/accounts/reset-password/",
            {
                "email": "reset.user@example.com",
                "reset_token": reset_token,
                "new_password": "N3wStrongPass!2025",
                "confirm_password": "N3wStrongPass!2025",
            },
            format="json",
        )
        self.assertEqual(reset.status_code, status.HTTP_200_OK, reset.data)

        # Old password must no longer work; new password must.
        old_login = self.client.post(
            "/api/accounts/login/",
            {"identifier": "reset.user@example.com", "password": "OldPass!2025"},
            format="json",
        )
        self.assertEqual(old_login.status_code, status.HTTP_401_UNAUTHORIZED)

        new_login = self.client.post(
            "/api/accounts/login/",
            {"identifier": "reset.user@example.com", "password": "N3wStrongPass!2025"},
            format="json",
        )
        self.assertEqual(new_login.status_code, status.HTTP_200_OK, new_login.data)

        # The reset_token/OTP must be single-use — replaying reset-password
        # with the same token must now fail (the OTP row was deleted).
        replay = self.client.post(
            "/api/accounts/reset-password/",
            {
                "email": "reset.user@example.com",
                "reset_token": reset_token,
                "new_password": "AnotherPass!2025",
                "confirm_password": "AnotherPass!2025",
            },
            format="json",
        )
        self.assertEqual(replay.status_code, status.HTTP_400_BAD_REQUEST)

    def test_wrong_otp_is_rejected(self):
        self._request_otp()
        real_code = self._extract_otp_from_last_email()
        wrong_code = f"{(int(real_code) + 1) % 1000000:06d}"

        response = self.client.post(
            "/api/accounts/verify-forgot-password-otp/",
            {"email": "reset.user@example.com", "otp": wrong_code},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expired_otp_is_rejected(self):
        self._request_otp()
        code = self._extract_otp_from_last_email()
        # Force the stored OTP into the past instead of waiting 5 real minutes.
        EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.PASSWORD_RESET).update(
            expires_at=timezone.now() - timezone.timedelta(seconds=1)
        )
        response = self.client.post(
            "/api/accounts/verify-forgot-password-otp/",
            {"email": "reset.user@example.com", "otp": code},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_forgot_password_for_unregistered_email_creates_pending_user_and_emails_otp(self):
        # Per accounts/views.py's own contract: forgot-password on an email
        # with no account doubles as self-registration — a real OTP goes to
        # that address so the same UI flow finishes the sign-up.
        self.assertFalse(User.objects.filter(email__iexact="brandnew@example.com").exists())
        self._request_otp(email="brandnew@example.com")
        self.assertEqual(mail.outbox[-1].to, ["brandnew@example.com"])
        pending_user = User.objects.get(email__iexact="brandnew@example.com")
        self.assertFalse(pending_user.has_usable_password())

    def test_forgot_password_for_disabled_account_sends_decoy_without_creating_otp_row(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self._request_otp()
        # An email still goes out (so the response can't be used to detect
        # a disabled account from the outside)...
        self.assertEqual(len(mail.outbox), 1)
        # ...but no verifiable EmailOTP row is created for it.
        self.assertFalse(
            EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.PASSWORD_RESET).exists()
        )

    def test_resend_otp_cooldown(self):
        first = self.client.post(
            "/api/accounts/resend-otp/", {"email": "reset.user@example.com"}, format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["resend_available_in"], 0)

        second = self.client.post(
            "/api/accounts/resend-otp/", {"email": "reset.user@example.com"}, format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(second.data["resend_available_in"], 60)

        # Cooldown must not have created a second EmailOTP row.
        self.assertEqual(
            EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.PASSWORD_RESET).count(), 1
        )
