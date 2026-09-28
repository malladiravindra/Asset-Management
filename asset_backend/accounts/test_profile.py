"""Profile (/api/accounts/me/), change password, and the User <-> Employee link."""
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from aduitlog.models import AuditLog
from assets.models import Department, Employee, Location

from . import roles
from .testing import grant_role

ME_URL = "/api/accounts/me/"
CHANGE_PASSWORD_URL = "/api/accounts/me/change-password/"


class MeAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = grant_role(
            User.objects.create_user(
                username="asha", email="asha@example.com", password="Old!Passw0rd", first_name="Asha", last_name="K"
            ),
            roles.ROLE_STANDARD,
        )
        self.other = User.objects.create_user(username="other", email="other@example.com", password="Other!Passw0rd")
        self.department = Department.objects.create(name="Profile Dept")
        self.location = Location.objects.create(name="Profile Site")
        self.client.force_authenticate(user=self.user)

    def link_employee(self, user=None):
        return Employee.objects.create(
            name="Asha Kumar", email="asha.work@example.com", phone="9876543210", designation="Analyst",
            department=self.department, location=self.location, user=user or self.user,
        )

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(ME_URL).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.patch(ME_URL, {}, format="json").status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_consolidated_profile_from_database(self):
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {"user", "employee", "roles", "permissions"})
        self.assertEqual(response.data["user"]["username"], "asha")
        self.assertEqual(response.data["user"]["display_name"], "Asha K")
        self.assertNotIn("password", response.data["user"])
        self.assertIsNone(response.data["employee"])
        self.assertEqual([r["name"] for r in response.data["roles"]], [roles.ROLE_STANDARD])
        self.assertIn("assets.change_asset", response.data["permissions"])
        self.assertNotIn("assets.delete_asset", response.data["permissions"])

    def test_linked_employee_is_the_profile_source(self):
        self.link_employee()
        data = self.client.get(ME_URL).data
        self.assertEqual(data["employee"]["name"], "Asha Kumar")
        self.assertEqual(data["employee"]["department_name"], "Profile Dept")
        self.assertEqual(data["user"]["display_name"], "Asha Kumar")

    def test_unlinked_user_updates_account_name_but_not_phone(self):
        response = self.client.patch(ME_URL, {"first_name": "Aasha"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(User.objects.get(pk=self.user.pk).first_name, "Aasha")
        response = self.client.patch(ME_URL, {"phone": "9876543210"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_linked_user_updates_phone_but_name_is_owned_by_employee(self):
        employee = self.link_employee()
        response = self.client.patch(ME_URL, {"phone": "+91 91234 56789"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        employee.refresh_from_db()
        self.assertEqual(employee.phone, "9123456789")
        response = self.client.patch(ME_URL, {"first_name": "Other"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_escalate_or_touch_other_accounts(self):
        employee = self.link_employee()
        response = self.client.patch(
            ME_URL,
            {"is_staff": True, "is_superuser": True, "roles": [1], "permissions": ["assets.delete_asset"],
             "username": "hijack", "designation": "CEO", "department": None, "id": self.other.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user = User.objects.get(pk=self.user.pk)
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertEqual(user.username, "asha")
        self.assertFalse(user.has_perm("assets.delete_asset"))
        employee.refresh_from_db()
        self.assertEqual(employee.designation, "Analyst")
        self.assertEqual(employee.department, self.department)
        self.assertEqual(User.objects.get(pk=self.other.pk).username, "other")

    def test_email_must_be_unused(self):
        response = self.client.patch(ME_URL, {"email": "OTHER@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.patch(ME_URL, {"email": "Asha.New@Example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(User.objects.get(pk=self.user.pk).email, "asha.new@example.com")

    def test_profile_change_is_audited_with_field_names_only(self):
        self.client.patch(ME_URL, {"first_name": "Aasha"}, format="json")
        log = AuditLog.objects.get(title="Profile updated for asha")
        self.assertEqual(log.context, "Changed: first_name")
        self.assertNotIn("Aasha", log.context)


class ChangePasswordTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="pw-user", email="pw@example.com", password="Old!Passw0rd")
        self.client.force_authenticate(user=self.user)

    def post(self, **overrides):
        payload = {"current_password": "Old!Passw0rd", "new_password": "N3w!Passw0rd", "confirm_password": "N3w!Passw0rd"}
        payload.update(overrides)
        return self.client.post(CHANGE_PASSWORD_URL, payload, format="json")

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.post().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_wrong_current_password(self):
        response = self.post(current_password="nope")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.data)
        self.assertTrue(User.objects.get(pk=self.user.pk).check_password("Old!Passw0rd"))

    def test_mismatch_and_policy_validation(self):
        self.assertEqual(self.post(confirm_password="Different!1").status_code, status.HTTP_400_BAD_REQUEST)
        weak = self.post(new_password="short", confirm_password="short")
        self.assertEqual(weak.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", weak.data)

    def test_success_rotates_credentials_and_is_audited(self):
        self.client.force_authenticate(user=None)
        login = self.client.post("/api/accounts/login/", {"identifier": "pw-user", "password": "Old!Passw0rd"}, format="json")
        old_refresh = login.data["refresh"]
        self.client.force_authenticate(user=self.user)

        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("access", response.data)
        self.assertNotIn("N3w!Passw0rd", response.content.decode())
        user = User.objects.get(pk=self.user.pk)
        self.assertTrue(user.check_password("N3w!Passw0rd"))
        self.assertNotEqual(user.password, "N3w!Passw0rd")  # hashed, never plaintext
        self.assertTrue(AuditLog.objects.filter(title="Password changed for pw-user").exists())

        self.client.force_authenticate(user=None)
        # Old sessions end: the pre-change refresh token is revoked.
        refreshed = self.client.post("/api/accounts/token/refresh/", {"refresh": old_refresh}, format="json")
        self.assertEqual(refreshed.status_code, status.HTTP_401_UNAUTHORIZED)
        cache.clear()
        ok = self.client.post("/api/accounts/login/", {"identifier": "pw-user", "password": "N3w!Passw0rd"}, format="json")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        bad = self.client.post("/api/accounts/login/", {"identifier": "pw-user", "password": "Old!Passw0rd"}, format="json")
        self.assertEqual(bad.status_code, status.HTTP_401_UNAUTHORIZED)


class EmployeeUserLinkTests(APITestCase):
    def setUp(self):
        self.admin = grant_role(User.objects.create_user(username="hr-admin", password="pw12345!"))
        self.standard = grant_role(User.objects.create_user(username="hr-standard", password="pw12345!"), roles.ROLE_STANDARD)
        self.account = User.objects.create_user(username="linked", password="pw12345!")
        self.location = Location.objects.create(name="Link Site")
        self.employee = Employee.objects.create(
            name="Link Person", email="link.person@example.com", phone="9000000001", location=self.location
        )
        self.url = f"/api/organization/employees/{self.employee.pk}/"

    def test_existing_employees_stay_unlinked(self):
        self.assertIsNone(Employee.objects.get(pk=self.employee.pk).user)

    def test_admin_links_and_unlinks(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(self.url, {"user": self.account.pk}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["user_username"], "linked")
        self.assertEqual(Employee.objects.get(pk=self.employee.pk).user, self.account)
        response = self.client.patch(self.url, {"user": None}, format="json")
        self.assertIsNone(Employee.objects.get(pk=self.employee.pk).user)

    def test_editing_other_fields_does_not_need_link_permission(self):
        self.client.force_authenticate(user=self.standard)
        response = self.client.patch(self.url, {"designation": "Lead"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_standard_user_cannot_change_link(self):
        self.client.force_authenticate(user=self.standard)
        response = self.client.patch(self.url, {"user": self.account.pk}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIsNone(Employee.objects.get(pk=self.employee.pk).user)

    def test_one_employee_per_account(self):
        Employee.objects.create(name="Already", email="already@example.com", phone="9000000002", user=self.account)
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(self.url, {"user": self.account.pk}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
