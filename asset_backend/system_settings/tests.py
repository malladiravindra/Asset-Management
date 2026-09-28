import smtplib
from unittest import mock

from django.conf import settings as django_settings
from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import SimpleTestCase
from django.urls import resolve
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.views import APIView
from rest_framework.viewsets import ViewSetMixin

from accounts.roles import ROLE_STANDARD
from accounts.testing import grant_role
from aduitlog.models import AuditLog
from aduitlog.services import create_audit_log
from assets.codes import next_asset_code
from assets.models import Asset, Department, Location
from catalog.models import Category
from operations.codes import next_po_number
from organization.codes import next_employee_id

from .models import SystemSettings
from .views import SystemSettingsAPIView, TestEmailAPIView

URL = "/api/settings/"
TEST_EMAIL_URL = "/api/settings/test-email/"


class SettingsAPITests(APITestCase):
    def setUp(self):
        cache.clear()  # throttle history lives in the cache; isolate each test
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="pw12345!", is_staff=True
        )
        self.user = User.objects.create_user(username="normal", email="n@example.com", password="pw12345!")

    # ---- auth / permissions ----------------------------------------------

    def test_requires_authentication(self):
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.patch(URL, {}, format="json").status_code, status.HTTP_401_UNAUTHORIZED)

    def test_normal_user_can_read_but_not_write(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["meta"]["can_edit"])
        response = self.client.patch(URL, {"organization_name": "Hacked"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.put(URL, {}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post(TEST_EMAIL_URL, {}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotEqual(SystemSettings.load().organization_name, "Hacked")

    # ---- read ---------------------------------------------------------------

    def test_get_returns_persisted_values_and_meta_without_secrets(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["settings"]["timezone"], "Asia/Kolkata")
        self.assertEqual(response.data["settings"]["currency"], "INR")
        self.assertTrue(response.data["meta"]["can_edit"])
        self.assertIn("Asia/Kolkata", response.data["meta"]["choices"]["timezone"])
        body = response.content.decode()
        # The actual secret VALUES must never appear, under any key.
        for secret in (django_settings.SECRET_KEY, django_settings.EMAIL_HOST_PASSWORD):
            self.assertTrue(secret)
            self.assertNotIn(secret, body)
        for name in ("SECRET_KEY", "EMAIL_HOST_PASSWORD", "DATABASE", "SIGNING_KEY"):
            self.assertNotIn(name, body)
        self.assertEqual(
            set(response.data["meta"]["email"]),
            {"smtp_host", "smtp_port", "smtp_use_tls", "host_user", "password_configured", "default_from_email"},
        )
        self.assertIsInstance(response.data["meta"]["email"]["password_configured"], bool)
        # SMTP account is masked, never returned in full.
        self.assertNotIn(django_settings.EMAIL_HOST_USER, body)

    def test_get_reports_field_status(self):
        self.client.force_authenticate(self.user)
        meta = self.client.get(URL).data["meta"]
        status_map = meta["field_status"]
        self.assertEqual(status_map["asset_code_prefix"], "active")
        self.assertEqual(status_map["audit_logging_enabled"], "active")
        self.assertEqual(status_map["maintenance_mode"], "active")  # enforced by MaintenanceModeMiddleware
        self.assertEqual(status_map["session_timeout_minutes"], "stored")
        self.assertEqual(status_map["auto_generate_asset_code"], "stored")
        self.assertEqual(status_map["allow_duplicate_serial_numbers"], "locked")
        self.assertEqual(status_map["po_require_vendor"], "locked")
        settings_keys = set(self.client.get(URL).data["settings"]) - {"updated_at", "updated_by_name"}
        self.assertEqual(set(status_map), settings_keys)

    def test_put_as_admin_updates(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put(URL, {"organization_name": "Put Corp", "currency": "USD"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(SystemSettings.load().currency, "USD")

    # ---- write --------------------------------------------------------------

    def test_patch_persists_and_is_singleton(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            URL, {"organization_name": "Acme Corp", "maintenance_reminder_days": 3}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["settings"]["organization_name"], "Acme Corp")
        self.assertEqual(SystemSettings.objects.count(), 1)
        reloaded = self.client.get(URL).data["settings"]
        self.assertEqual(reloaded["organization_name"], "Acme Corp")
        self.assertEqual(reloaded["maintenance_reminder_days"], 3)
        self.assertEqual(reloaded["updated_by_name"], "admin")

    def test_validation_errors_are_field_level(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            URL,
            {
                "po_approval_threshold": "-1",
                "otp_expiry_minutes": 0,
                "session_timeout_minutes": 0,
                "minimum_password_length": 5,
                "timezone": "Mars/Olympus",
                "asset_number_format": "{NUMBER}-{PREFIX}",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for field in (
            "po_approval_threshold", "otp_expiry_minutes", "session_timeout_minutes",
            "minimum_password_length", "timezone", "asset_number_format",
        ):
            self.assertIn(field, response.data)
        self.assertEqual(
            str(response.data["po_approval_threshold"][0]),
            "Approval threshold must be greater than or equal to 0.",
        )

    def test_locked_field_cannot_be_changed(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(URL, {"allow_duplicate_serial_numbers": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("allow_duplicate_serial_numbers", response.data)

    def test_maintenance_mode_requires_message(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(URL, {"maintenance_mode": True, "maintenance_message": "  "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("maintenance_message", response.data)

    def test_prefix_is_normalized(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(URL, {"asset_code_prefix": " ax "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["settings"]["asset_code_prefix"], "AX")
        bad = self.client.patch(URL, {"po_prefix": "P O!"}, format="json")
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_settings_change_is_audited(self):
        self.client.force_authenticate(self.admin)
        self.client.patch(URL, {"city": "Hyderabad"}, format="json")
        log = AuditLog.objects.get(title="System settings updated")
        self.assertEqual(log.action, AuditLog.ACTION_UPDATE)
        self.assertIn("Module: Settings", log.context)
        self.assertIn("city", log.context)
        self.assertNotIn("Hyderabad", log.context)  # names only, never values
        self.assertEqual(log.actor, self.admin)
        self.assertIsNotNone(log.timestamp)

    def test_settings_change_audited_even_when_tracking_disabled(self):
        s = SystemSettings.load()
        s.audit_logging_enabled = False
        s.save()
        self.client.force_authenticate(self.admin)
        self.client.patch(URL, {"city": "Pune"}, format="json")
        self.assertTrue(AuditLog.objects.filter(title="System settings updated").exists())

    def test_failed_update_is_not_audited(self):
        self.client.force_authenticate(self.admin)
        self.client.patch(URL, {"otp_expiry_minutes": 0}, format="json")
        self.client.force_authenticate(self.user)
        self.client.patch(URL, {"city": "X"}, format="json")
        self.assertFalse(AuditLog.objects.filter(title="System settings updated").exists())

    # ---- test email ---------------------------------------------------------

    def test_test_email_sends_real_message(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(TEST_EMAIL_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["admin@example.com"])

    def test_test_email_reports_smtp_failure(self):
        self.client.force_authenticate(self.admin)
        with mock.patch(
            "django.core.mail.EmailMessage.send",
            side_effect=smtplib.SMTPAuthenticationError(535, b"bad credentials"),
        ):
            response = self.client.post(TEST_EMAIL_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertIn("authentication", response.data["detail"].lower())
        self.assertEqual(len(mail.outbox), 0)

    def test_test_email_rejects_invalid_recipient(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(TEST_EMAIL_URL, {"recipient": "not-an-email"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recipient", response.data)

    def test_test_email_throttled_at_5_per_minute(self):
        self.client.force_authenticate(self.admin)
        codes = [self.client.post(TEST_EMAIL_URL, {}, format="json").status_code for _ in range(6)]
        self.assertEqual(codes[:5], [status.HTTP_200_OK] * 5)
        self.assertEqual(codes[5], status.HTTP_429_TOO_MANY_REQUESTS)


class SettingsArchitectureTests(SimpleTestCase):
    """Settings is served by explicit APIView classes on explicit paths only."""

    def test_endpoints_resolve_to_apiviews_not_viewsets(self):
        for url in (URL, TEST_EMAIL_URL):
            view_class = resolve(url).func.view_class
            self.assertTrue(issubclass(view_class, APIView), url)
            self.assertFalse(issubclass(view_class, ViewSetMixin), url)
        self.assertIs(resolve(URL).func.view_class, SystemSettingsAPIView)
        self.assertIs(resolve(TEST_EMAIL_URL).func.view_class, TestEmailAPIView)


class SettingsBehaviourTests(APITestCase):
    """Settings actually drive the existing generators / audit service."""

    def test_code_generators_follow_settings(self):
        category = Category.objects.create(name="QA Settings Laptops", code="QS")
        self.assertEqual(next_asset_code(category), "AF-QS-0001")
        self.assertTrue(next_po_number().startswith("PO-"))
        self.assertTrue(next_employee_id().startswith("EMP-"))

        s = SystemSettings.load()
        s.asset_code_prefix = "ZZ"
        s.starting_asset_number = 500
        s.po_prefix = "PUR"
        s.employee_id_prefix = "STAFF"
        s.save()
        self.assertEqual(next_asset_code(category), "ZZ-QS-0500")
        self.assertTrue(next_po_number().startswith("PUR-"))
        self.assertTrue(next_employee_id().startswith("STAFF-"))

    def test_existing_asset_numbering_continues(self):
        category = Category.objects.create(name="QA Settings Monitors", code="QM")
        department = Department.objects.create(name="QA Settings Dept")
        location = Location.objects.create(name="QA Settings Site")
        Asset.objects.create(
            asset_code="AF-QM-0042", name="Monitor", category=category, serial_number="DL888888888",
            department=department, location=location, cost=100,
        )
        self.assertEqual(next_asset_code(category), "AF-QM-0043")
        # A starting number below the existing max never rewinds the sequence.
        s = SystemSettings.load()
        s.starting_asset_number = 5
        s.save()
        self.assertEqual(next_asset_code(category), "AF-QM-0043")

    def test_audit_toggles_are_respected(self):
        s = SystemSettings.load()
        s.audit_track_create = False
        s.save()
        self.assertIsNone(create_audit_log(action="CREATE", title="skipped"))
        self.assertIsNotNone(create_audit_log(action="UPDATE", title="kept"))
        self.assertIsNotNone(create_audit_log(action="CREATE", title="manual", respect_settings=False))
        s.audit_logging_enabled = False
        s.save()
        self.assertIsNone(create_audit_log(action="UPDATE", title="skipped"))


def _set(**values):
    s = SystemSettings.load()
    for key, value in values.items():
        setattr(s, key, value)
    s.save()
    return s


class ActivatedSecuritySettingsTests(APITestCase):
    """Settings > Security values that are now enforced at runtime."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="lockme", email="lock.me@example.com", password="Str0ngPass!2025"
        )

    # ---- password policy (AUTH_PASSWORD_VALIDATORS) -----------------------

    def _register(self, password, username="policyuser"):
        return self.client.post(
            "/api/accounts/register/",
            {"username": username, "email": f"{username}@example.com", "password": password},
            format="json",
        )

    def test_password_policy_character_rules_enforced(self):
        response = self._register("alllowercase123!")  # no uppercase (default rule)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("uppercase", str(response.data["password"]))
        _set(password_require_special=True)
        response = self._register("NoSpecial12345")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("special character", str(response.data["password"]))
        self.assertEqual(self._register("Has-Special12345").status_code, status.HTTP_201_CREATED)

    def test_password_policy_minimum_length_follows_setting(self):
        _set(minimum_password_length=14)
        response = self._register("Short!Pass123")  # 13 chars
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("at least 14 characters", str(response.data["password"]))
        self.assertEqual(self._register("LongEnough!Pass1").status_code, status.HTTP_201_CREATED)

    # ---- OTP timing ---------------------------------------------------------

    def test_otp_expiry_and_resend_interval_follow_settings(self):
        from accounts.models import EmailOTP
        from accounts.utils import issue_otp

        _set(otp_expiry_minutes=12, otp_resend_interval_seconds=300)
        otp, sent = issue_otp(self.user, EmailOTP.PASSWORD_RESET)
        self.assertTrue(sent)
        lifetime = (otp.expires_at - otp.last_sent_at).total_seconds()
        self.assertAlmostEqual(lifetime, 12 * 60, delta=2)
        self.assertIn("expire in 12 minutes", mail.outbox[-1].body)
        # Within the 300 s resend interval: no new email, existing OTP reused.
        _again, sent_again = issue_otp(self.user, EmailOTP.PASSWORD_RESET)
        self.assertFalse(sent_again)
        self.assertEqual(len(mail.outbox), 1)

    # ---- login lockout ------------------------------------------------------

    def _login(self, password, identifier="lock.me@example.com"):
        return self.client.post(
            "/api/accounts/login/", {"identifier": identifier, "password": password}, format="json"
        )

    def test_login_lockout_after_max_attempts(self):
        _set(max_login_attempts=3, account_lockout_minutes=10)
        self.assertEqual(self._login("wrong-1").status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self._login("wrong-2").status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self._login("wrong-3").status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        # Locked: even the correct password is refused.
        self.assertEqual(self._login("Str0ngPass!2025").status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_lockout_is_identical_for_unknown_accounts(self):
        _set(max_login_attempts=2)
        self._login("x", identifier="ghost@example.com")
        response = self._login("x", identifier="ghost@example.com")
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_successful_login_resets_failure_count(self):
        _set(max_login_attempts=3)
        self._login("wrong-1")
        self._login("wrong-2")
        self.assertEqual(self._login("Str0ngPass!2025").status_code, status.HTTP_200_OK)
        self.assertEqual(self._login("wrong-3").status_code, status.HTTP_401_UNAUTHORIZED)

    # ---- login/logout audit -------------------------------------------------

    def test_login_logout_audited_only_when_tracking_enabled(self):
        self._login("Str0ngPass!2025")
        self.assertFalse(AuditLog.objects.filter(action=AuditLog.ACTION_LOGIN).exists())  # default off
        _set(audit_track_login=True, audit_track_logout=True)
        response = self._login("Str0ngPass!2025")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(AuditLog.objects.get(action=AuditLog.ACTION_LOGIN).actor, self.user)
        self.client.post("/api/accounts/logout/", {"refresh": response.data["refresh"]}, format="json")
        self.assertEqual(AuditLog.objects.get(action=AuditLog.ACTION_LOGOUT).actor, self.user)

    def test_failed_login_is_not_audited_as_login(self):
        _set(audit_track_login=True)
        self._login("wrong")
        self.assertFalse(AuditLog.objects.filter(action=AuditLog.ACTION_LOGIN).exists())


class MaintenanceModeTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="ops-admin", password="pw", is_staff=True)
        self.normal = User.objects.create_user(username="ops-user", password="pw")
        # Business endpoints need a role (as real accounts have since accounts/0008).
        grant_role(self.staff)
        grant_role(self.normal, ROLE_STANDARD)
        _set(maintenance_mode=True, maintenance_message="Back at 6 PM.")

    def _get(self, user, path):
        from rest_framework_simplejwt.tokens import AccessToken

        headers = {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"} if user else {}
        return self.client.get(path, **headers)

    def test_normal_user_gets_503_with_message(self):
        response = self._get(self.normal, "/api/assets/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"detail": "Back at 6 PM.", "maintenance_mode": True})

    def test_staff_bypass(self):
        self.assertEqual(self._get(self.staff, "/api/assets/").status_code, status.HTTP_200_OK)

    def test_unauthenticated_still_401(self):
        self.assertEqual(self._get(None, "/api/assets/").status_code, status.HTTP_401_UNAUTHORIZED)

    def test_settings_and_accounts_exempt(self):
        self.assertEqual(self._get(self.normal, "/api/settings/").status_code, status.HTTP_200_OK)
        response = self.client.post(
            "/api/accounts/login/", {"identifier": "x@example.com", "password": "x"}, format="json"
        )
        self.assertNotEqual(response.status_code, 503)

    def test_off_means_no_blocking(self):
        _set(maintenance_mode=False)
        self.assertEqual(self._get(self.normal, "/api/assets/").status_code, status.HTTP_200_OK)


class ActivatedOperationSettingsTests(APITestCase):
    """Maintenance / Repairs / Purchase Orders / Assignments settings now enforced."""

    def setUp(self):
        import datetime

        from assets.models import Employee
        from operation.models import MaintenanceRecord, RepairRecord
        from organization.models import Vendor

        self.MR, self.RR, self.today = MaintenanceRecord, RepairRecord, datetime.date.today()
        self.user = User.objects.create_user(username="ops", password="pw")
        grant_role(self.user)
        self.client.force_authenticate(self.user)
        category = Category.objects.create(name="QA Settings Ops", code="QX")
        self.department = Department.objects.create(name="QA Settings Ops Dept")
        location = Location.objects.create(name="QA Settings Ops Site")
        self.asset = Asset.objects.create(
            asset_code="AF-QX-0001", name="Laptop", category=category, serial_number="DL777777777",
            department=self.department, location=location, cost=1000,
        )
        self.emp_a = Employee.objects.create(name="Settings Emp A", department=self.department)
        self.emp_b = Employee.objects.create(name="Settings Emp B", department=self.department)
        self.vendor = Vendor.objects.create(
            name="Settings Vendor", email="v@example.com", vendor_type=Vendor.TYPE_DISTRIBUTOR,
            company_name="Settings Vendor Ltd", phone="+91 80000 22222", address="Hyderabad",
        )

    def _maintenance(self, **overrides):
        payload = {
            "asset": self.asset.id, "type": self.MR.TYPE_CORRECTIVE, "technician": "Tech",
            "priority": self.MR.PRIORITY_MEDIUM, "scheduled_date": self.today.isoformat(), "cost": "10.00",
        }
        payload.update(overrides)
        return self.client.post("/api/operation/maintenance/", payload, format="json")

    def _repair(self, **overrides):
        payload = {
            "asset": self.asset.id, "issue_type": self.RR.ISSUE_SCREEN_DAMAGE, "issue": "Cracked",
            "vendor": "Service Center", "priority": self.RR.PRIORITY_HIGH, "under_warranty": False,
            "cost": "100.00", "reported_date": "2026-09-01", "expected_return_date": "2026-09-08",
        }
        payload.update(overrides)
        return self.client.post("/api/operation/repairs/", payload, format="json")

    def _po(self, **overrides):
        payload = {
            "vendor": self.vendor.name, "department": self.department.name, "requested_by": self.emp_a.name,
            "expected_date": "2026-12-01",
            "items": [{"name": "Monitor", "category": "Monitors", "quantity": 1, "unit_cost": "100.00"}],
        }
        payload.update(overrides)
        return self.client.post("/api/operations/purchase-orders/", payload, format="json")

    def test_default_maintenance_status_applied_when_omitted(self):
        _set(default_maintenance_status=self.MR.STATUS_IN_PROGRESS)
        response = self._maintenance()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], "In Progress")
        # An explicit status still wins.
        self.assertEqual(self._maintenance(status=self.MR.STATUS_SCHEDULED).data["status"], "Scheduled")

    def test_preventive_and_future_scheduling_toggles(self):
        import datetime

        _set(allow_preventive_maintenance=False, allow_maintenance_scheduling=False)
        response = self._maintenance(type=self.MR.TYPE_PREVENTIVE)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("type", response.data)
        future = (self.today + datetime.timedelta(days=5)).isoformat()
        response = self._maintenance(scheduled_date=future)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("scheduled_date", response.data)
        self.assertEqual(self._maintenance().status_code, status.HTTP_201_CREATED)  # today is fine

    def test_default_repair_status_and_require_cost(self):
        _set(default_repair_status=self.RR.STATUS_IN_PROGRESS)
        response = self._repair()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], "In Progress")
        self.assertEqual(self._repair(cost="0").status_code, status.HTTP_201_CREATED)  # off by default
        _set(require_repair_cost=True)
        response = self._repair(cost="0")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cost", response.data)

    def test_po_default_status_and_partial_receiving(self):
        _set(default_po_status="Pending Approval")
        created = self._po()
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["status"], "Pending Approval")
        url = "/api/operations/purchase-orders/%d/" % created.data["id"]
        _set(allow_partial_receiving=False)
        response = self.client.patch(url, {"status": "Partially Received"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)
        _set(allow_partial_receiving=True)
        response = self.client.patch(url, {"status": "Partially Received"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_allow_reassignment(self):
        created = self.client.post(
            "/api/operations/assignments/",
            {"asset": self.asset.id, "person": self.emp_a.id, "assigned_date": "2026-09-01"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        url = "/api/operations/assignments/%d/" % created.data["id"]
        _set(allow_reassignment=False)
        response = self.client.patch(url, {"person": self.emp_b.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("person", response.data)
        _set(allow_reassignment=True)
        self.assertEqual(self.client.patch(url, {"person": self.emp_b.id}, format="json").status_code, status.HTTP_200_OK)


class FieldStatusDocumentationTests(APITestCase):
    def test_every_stored_field_has_a_reason(self):
        user = User.objects.create_user(username="reader", password="pw")
        self.client.force_authenticate(user)
        meta = self.client.get(URL).data["meta"]
        stored = {k for k, v in meta["field_status"].items() if v == "stored"}
        self.assertEqual(stored, set(meta["stored_reasons"]))
        for key in ("maintenance_mode", "max_login_attempts", "minimum_password_length", "audit_track_login"):
            self.assertEqual(meta["field_status"][key], "active", key)
        for key in ("session_timeout_minutes", "password_expiry_days", "auto_generate_asset_code", "audit_retention_days"):
            self.assertEqual(meta["field_status"][key], "stored", key)
