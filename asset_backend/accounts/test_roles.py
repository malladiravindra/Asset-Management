"""Roles & Permissions: role/permission/user APIs, backend enforcement on
business endpoints, default roles for new accounts, and audit logging."""
from django.contrib.auth.models import Group, Permission, User
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from aduitlog.models import AuditLog
from catalog.models import Category
from system_settings.models import SystemSettings

from . import roles
from .models import RoleProfile
from .testing import grant_role

ROLES_URL = "/api/accounts/roles/"
PERMISSIONS_URL = "/api/accounts/permissions/"
USERS_URL = "/api/accounts/users/"


def perm(label):
    app_label, codename = label.split(".")
    return Permission.objects.get(content_type__app_label=app_label, codename=codename)


class RBACTestCase(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = grant_role(User.objects.create_user(username="role-admin", password="pw12345!"))
        self.standard = grant_role(User.objects.create_user(username="standard", password="pw12345!"), roles.ROLE_STANDARD)
        self.viewer = grant_role(User.objects.create_user(username="viewer", password="pw12345!"), roles.ROLE_VIEWER)
        self.nobody = User.objects.create_user(username="no-role", password="pw12345!")
        self.superuser = User.objects.create_superuser(username="root", password="pw12345!", email="root@example.com")

    def as_user(self, user):
        # Fresh instance per request so Django's per-object permission cache
        # never masks a change made earlier in the same test.
        self.client.force_authenticate(user=User.objects.get(pk=user.pk) if user else None)


class SeededRolesTests(RBACTestCase):
    def test_migration_seeds_three_roles_with_profiles(self):
        for name in (roles.ROLE_ADMINISTRATOR, roles.ROLE_STANDARD, roles.ROLE_VIEWER):
            group = Group.objects.get(name=name)
            self.assertTrue(RoleProfile.objects.filter(group=group, is_active=True).exists())

    def test_seeded_permission_sets(self):
        standard = set(roles.permission_label(p) for p in Group.objects.get(name=roles.ROLE_STANDARD).permissions.all())
        viewer = set(roles.permission_label(p) for p in Group.objects.get(name=roles.ROLE_VIEWER).permissions.all())
        self.assertIn("assets.change_asset", standard)
        self.assertNotIn("assets.delete_asset", standard)
        self.assertNotIn("system_settings.change_systemsettings", standard)
        self.assertNotIn("auth.change_group", standard)
        self.assertTrue(all(label.split(".")[1].startswith("view_") for label in viewer))
        self.assertNotIn("aduitlog.view_auditlog", viewer)


class RoleAPITests(RBACTestCase):
    def test_list_requires_authentication_and_permission(self):
        self.as_user(None)
        self.assertEqual(self.client.get(ROLES_URL).status_code, status.HTTP_401_UNAUTHORIZED)
        for user in (self.standard, self.viewer, self.nobody):
            self.as_user(user)
            self.assertEqual(self.client.get(ROLES_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_list_shape(self):
        self.as_user(self.admin)
        response = self.client.get(ROLES_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        admin_role = next(r for r in response.data if r["name"] == roles.ROLE_ADMINISTRATOR)
        self.assertEqual(
            set(admin_role),
            {"id", "name", "description", "is_active", "user_count", "permission_count", "permissions",
             "created_by_name", "created_at", "updated_at"},
        )
        self.assertEqual(admin_role["user_count"], 1)
        admin_group = Group.objects.get(name=roles.ROLE_ADMINISTRATOR)
        self.assertEqual(admin_role["permission_count"], admin_group.permissions.count())
        self.assertEqual(admin_role["permission_count"], len(admin_role["permissions"]))
        self.assertIn(perm("assets.delete_asset").pk, admin_role["permissions"])

    def test_create_role_records_profile_and_audit(self):
        self.as_user(self.admin)
        payload = {"name": "Auditor", "description": "Reads logs", "permissions": [perm("aduitlog.view_auditlog").pk]}
        response = self.client.post(ROLES_URL, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        group = Group.objects.get(name="Auditor")
        self.assertEqual(group.role_profile.created_by, self.admin)
        self.assertEqual(response.data["user_count"], 0)
        self.assertTrue(AuditLog.objects.filter(title="Role Auditor created", actor=self.admin).exists())

    def test_create_rejects_duplicate_name_and_uncatalogued_permission(self):
        self.as_user(self.admin)
        dup = self.client.post(ROLES_URL, {"name": "viewer"}, format="json")
        self.assertEqual(dup.status_code, status.HTTP_400_BAD_REQUEST)
        session_perm = Permission.objects.get(content_type__app_label="sessions", codename="view_session")
        bad = self.client.post(ROLES_URL, {"name": "Sneaky", "permissions": [session_perm.pk]}, format="json")
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Group.objects.filter(name="Sneaky").exists())

    def test_role_manager_cannot_grant_permissions_they_lack(self):
        manager_role = Group.objects.create(name="Role Manager")
        manager_role.permissions.set([perm(label) for label in roles.ROLE_ADMIN_PERMISSIONS])
        manager = User.objects.create_user(username="manager", password="pw12345!")
        manager.groups.add(manager_role)
        self.as_user(manager)
        response = self.client.post(
            ROLES_URL, {"name": "Deleters", "permissions": [perm("assets.delete_asset").pk]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Group.objects.filter(name="Deleters").exists())
        # ...but may create roles from permissions they hold.
        ok = self.client.post(ROLES_URL, {"name": "Group Viewers", "permissions": [perm("auth.view_group").pk]}, format="json")
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED, ok.data)

    def test_update_role_and_permission_change_audit(self):
        self.as_user(self.admin)
        role = Group.objects.get(name=roles.ROLE_VIEWER)
        before = list(role.permissions.values_list("pk", flat=True))
        response = self.client.patch(
            f"{ROLES_URL}{role.pk}/",
            {"description": "Read only", "permissions": before + [perm("assets.add_asset").pk]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["description"], "Read only")
        log = AuditLog.objects.get(title="Role Viewer updated")
        self.assertIn("description", log.context)
        self.assertIn("permissions +1 -0", log.context)

    def test_deactivated_role_grants_nothing(self):
        category = Category.objects.create(name="RBAC Deactivate", code="RD")
        self.as_user(self.admin)
        role = Group.objects.get(name=roles.ROLE_VIEWER)
        self.assertEqual(self.client.patch(f"{ROLES_URL}{role.pk}/", {"is_active": False}, format="json").status_code, 200)
        self.assertFalse(User.objects.get(pk=self.viewer.pk).has_perm("catalog.view_category"))
        self.as_user(self.viewer)
        self.assertEqual(self.client.get(f"/api/catalog/categories/{category.pk}/").status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_role(self):
        self.as_user(self.admin)
        in_use = Group.objects.get(name=roles.ROLE_VIEWER)
        self.assertEqual(self.client.delete(f"{ROLES_URL}{in_use.pk}/").status_code, status.HTTP_400_BAD_REQUEST)
        empty = Group.objects.create(name="Temporary")
        self.assertEqual(self.client.delete(f"{ROLES_URL}{empty.pk}/").status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Group.objects.filter(pk=empty.pk).exists())
        self.assertTrue(AuditLog.objects.filter(title="Role Temporary deleted").exists())

    def test_normal_users_cannot_modify_roles(self):
        role = Group.objects.get(name=roles.ROLE_VIEWER)
        for user in (self.standard, self.viewer):
            self.as_user(user)
            self.assertEqual(self.client.post(ROLES_URL, {"name": "X"}, format="json").status_code, 403)
            self.assertEqual(self.client.patch(f"{ROLES_URL}{role.pk}/", {"description": "x"}, format="json").status_code, 403)
            self.assertEqual(self.client.delete(f"{ROLES_URL}{role.pk}/").status_code, 403)

    def test_permission_changes_not_audited_when_tracking_off(self):
        settings_row = SystemSettings.load()
        settings_row.audit_track_permission_changes = False
        settings_row.save()
        self.as_user(self.admin)
        self.client.post(ROLES_URL, {"name": "Quiet"}, format="json")
        self.assertFalse(AuditLog.objects.filter(title="Role Quiet created").exists())


class RoleManagementExtraTests(RBACTestCase):
    """Settings > Roles & Permissions: detail, counts, reactivation and the
    delete / assignment guards, all through direct API calls."""

    def test_retrieve_role_detail(self):
        self.as_user(self.admin)
        role = Group.objects.get(name=roles.ROLE_STANDARD)
        response = self.client.get(f"{ROLES_URL}{role.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], roles.ROLE_STANDARD)
        self.assertEqual(response.data["user_count"], role.user_set.count())
        self.assertEqual(response.data["permission_count"], role.permissions.count())
        self.assertEqual(sorted(response.data["permissions"]), sorted(role.permissions.values_list("pk", flat=True)))
        self.as_user(self.viewer)
        self.assertEqual(self.client.get(f"{ROLES_URL}{role.pk}/").status_code, status.HTTP_403_FORBIDDEN)

    def test_create_and_update_permissions_without_duplicating_rows(self):
        before = Permission.objects.count()
        self.as_user(self.admin)
        view_asset, add_asset = perm("assets.view_asset"), perm("assets.add_asset")
        response = self.client.post(
            ROLES_URL, {"name": "Auditors", "description": "d", "permissions": [view_asset.pk]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["permission_count"], 1)
        role_id = response.data["id"]
        response = self.client.patch(
            f"{ROLES_URL}{role_id}/", {"permissions": [view_asset.pk, add_asset.pk]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(set(response.data["permissions"]), {view_asset.pk, add_asset.pk})
        self.assertEqual(set(Group.objects.get(pk=role_id).permissions.all()), {view_asset, add_asset})
        self.assertEqual(Permission.objects.count(), before)

    def test_duplicate_name_rejected_case_insensitively(self):
        self.as_user(self.admin)
        response = self.client.post(ROLES_URL, {"name": roles.ROLE_VIEWER.upper()}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_reactivating_role_restores_permissions(self):
        self.as_user(self.admin)
        role = Group.objects.get(name=roles.ROLE_VIEWER)
        held = role.permissions.count()
        self.client.patch(f"{ROLES_URL}{role.pk}/", {"is_active": False}, format="json")
        self.assertEqual(Group.objects.get(pk=role.pk).permissions.count(), held)
        self.assertFalse(User.objects.get(pk=self.viewer.pk).has_perm("assets.view_asset"))
        self.client.patch(f"{ROLES_URL}{role.pk}/", {"is_active": True}, format="json")
        self.assertTrue(User.objects.get(pk=self.viewer.pk).has_perm("assets.view_asset"))
        self.as_user(self.viewer)
        self.assertIn("assets.view_asset", self.client.get("/api/accounts/me/").data["permissions"])

    def test_role_with_users_cannot_be_deleted(self):
        self.as_user(self.admin)
        role = Group.objects.get(name=roles.ROLE_STANDARD)
        response = self.client.delete(f"{ROLES_URL}{role.pk}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot be deleted because users are assigned", response.data["detail"])
        self.assertTrue(Group.objects.filter(pk=role.pk).exists())

    def test_assign_multiple_roles(self):
        self.as_user(self.admin)
        standard, viewer = Group.objects.get(name=roles.ROLE_STANDARD), Group.objects.get(name=roles.ROLE_VIEWER)
        response = self.client.put(f"{USERS_URL}{self.nobody.pk}/roles/", {"roles": [standard.pk, viewer.pk]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(set(User.objects.get(pk=self.nobody.pk).groups.all()), {standard, viewer})

    def test_inactive_role_cannot_be_newly_assigned(self):
        dormant = Group.objects.create(name="Dormant")
        RoleProfile.objects.create(group=dormant, is_active=False)
        self.as_user(self.admin)
        url = f"{USERS_URL}{self.nobody.pk}/roles/"
        response = self.client.put(url, {"roles": [dormant.pk]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.get(pk=self.nobody.pk).groups.exists())
        # An existing membership of an inactive role survives other edits.
        self.nobody.groups.add(dormant)
        viewer = Group.objects.get(name=roles.ROLE_VIEWER)
        response = self.client.put(url, {"roles": [dormant.pk, viewer.pk]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        # Superusers keep Django superuser capabilities.
        other = User.objects.create_user(username="other", password="pw12345!")
        self.as_user(self.superuser)
        response = self.client.put(f"{USERS_URL}{other.pk}/roles/", {"roles": [dormant.pk]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_role_manager_cannot_grant_ungranted_permission_on_update(self):
        manager_role = Group.objects.create(name="Role Manager")
        manager_role.permissions.set([perm("auth.view_group"), perm("auth.change_group"), perm("assets.view_asset")])
        manager = User.objects.create_user(username="rolemgr2", password="pw12345!")
        manager.groups.add(manager_role)
        target = Group.objects.create(name="Target")
        self.as_user(manager)
        response = self.client.patch(
            f"{ROLES_URL}{target.pk}/", {"permissions": [perm("assets.delete_asset").pk]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(target.permissions.exists())


class PermissionCatalogueTests(RBACTestCase):
    def test_catalogue_only_lists_enforced_permissions(self):
        self.as_user(self.admin)
        response = self.client.get(PERMISSIONS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data[0]), {"id", "app_label", "model", "codename", "name"})
        labels = {f"{p['app_label']}.{p['codename']}" for p in response.data}
        self.assertIn("assets.delete_asset", labels)
        self.assertNotIn("sessions.view_session", labels)
        self.assertNotIn("accounts.view_emailotp", labels)

    def test_catalogue_forbidden_without_permission(self):
        self.as_user(self.standard)
        self.assertEqual(self.client.get(PERMISSIONS_URL).status_code, status.HTTP_403_FORBIDDEN)


class UserRoleAssignmentTests(RBACTestCase):
    def test_user_list_hides_password_and_requires_permission(self):
        self.as_user(self.admin)
        response = self.client.get(USERS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("password", response.data["results"][0])
        self.assertIn("roles", response.data["results"][0])
        self.as_user(self.standard)
        self.assertEqual(self.client.get(USERS_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_assign_and_remove_roles(self):
        self.as_user(self.admin)
        standard_role = Group.objects.get(name=roles.ROLE_STANDARD)
        url = f"{USERS_URL}{self.viewer.pk}/roles/"
        response = self.client.put(url, {"roles": [standard_role.pk]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual([r["name"] for r in response.data["roles"]], [roles.ROLE_STANDARD])
        self.assertTrue(User.objects.get(pk=self.viewer.pk).has_perm("assets.add_asset"))
        log = AuditLog.objects.get(title="Roles changed for viewer")
        self.assertIn("Added: Standard User", log.context)
        self.assertIn("Removed: Viewer", log.context)

        self.client.put(url, {"roles": []}, format="json")
        self.assertFalse(User.objects.get(pk=self.viewer.pk).has_perm("assets.view_asset"))

    def test_normal_user_cannot_assign_roles(self):
        admin_role = Group.objects.get(name=roles.ROLE_ADMINISTRATOR)
        self.as_user(self.standard)
        response = self.client.put(f"{USERS_URL}{self.standard.pk}/roles/", {"roles": [admin_role.pk]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.get(pk=self.standard.pk).groups.filter(pk=admin_role.pk).exists())

    def test_admin_cannot_change_own_roles_but_superuser_can(self):
        viewer_role = Group.objects.get(name=roles.ROLE_VIEWER)
        self.as_user(self.admin)
        response = self.client.put(f"{USERS_URL}{self.admin.pk}/roles/", {"roles": [viewer_role.pk]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.as_user(self.superuser)
        response = self.client.put(f"{USERS_URL}{self.superuser.pk}/roles/", {"roles": [viewer_role.pk]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_cannot_assign_role_with_permissions_actor_lacks(self):
        manager_role = Group.objects.create(name="User Manager")
        manager_role.permissions.set([perm("auth.change_user"), perm("auth.view_user")])
        manager = User.objects.create_user(username="usermgr", password="pw12345!")
        manager.groups.add(manager_role)
        admin_role = Group.objects.get(name=roles.ROLE_ADMINISTRATOR)
        self.as_user(manager)
        response = self.client.put(f"{USERS_URL}{self.viewer.pk}/roles/", {"roles": [admin_role.pk]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class BackendEnforcementTests(RBACTestCase):
    """Frontend hiding is not security: the API itself must refuse."""

    def test_crud_mapped_to_model_permissions(self):
        category = Category.objects.create(name="RBAC Enforce", code="RE")
        detail = f"/api/catalog/categories/{category.pk}/"

        self.as_user(self.viewer)
        self.assertEqual(self.client.get(detail).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post("/api/catalog/categories/", {"name": "RBAC New"}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(detail, {"description": "x"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(detail).status_code, 403)

        self.as_user(self.standard)
        self.assertEqual(self.client.patch(detail, {"description": "edited"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(detail).status_code, 403)

        self.as_user(self.admin)
        self.assertEqual(self.client.delete(detail).status_code, status.HTTP_204_NO_CONTENT)

    def test_user_without_role_is_denied_business_data(self):
        self.as_user(self.nobody)
        for url in ("/api/assets/", "/api/catalog/categories/", "/api/organization/employees/",
                    "/api/operation/repairs/", "/api/operations/assignments/", "/api/dashboard/", "/api/reports/"):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN, url)
        # Settings stay readable (every module needs the values).
        self.assertEqual(self.client.get("/api/settings/").status_code, status.HTTP_200_OK)

    def test_superuser_passes_every_check_without_roles(self):
        self.as_user(self.superuser)
        for url in ("/api/assets/", "/api/audit-logs/", ROLES_URL, USERS_URL, PERMISSIONS_URL):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK, url)

    def test_staff_keeps_settings_and_audit_admin_access(self):
        staff = User.objects.create_user(username="staff-only", password="pw12345!", is_staff=True)
        self.as_user(staff)
        self.assertEqual(self.client.patch("/api/settings/", {"organization_name": "Staff Co"}, format="json").status_code, 200)
        self.assertEqual(self.client.get("/api/audit-logs/").status_code, status.HTTP_200_OK)
        self.assertTrue(self.client.get("/api/settings/").data["meta"]["can_edit"])

    def test_audit_logs_require_view_permission(self):
        self.as_user(self.viewer)
        self.assertEqual(self.client.get("/api/audit-logs/").status_code, status.HTTP_403_FORBIDDEN)
        self.as_user(self.standard)
        self.assertEqual(self.client.get("/api/audit-logs/").status_code, status.HTTP_200_OK)

    def test_dashboard_hides_recent_activity_without_audit_permission(self):
        AuditLog.objects.create(action=AuditLog.ACTION_CREATE, title="Something happened")
        self.as_user(self.viewer)
        self.assertEqual(self.client.get("/api/dashboard/").data["recent_activity"], [])
        self.as_user(self.standard)
        self.assertTrue(self.client.get("/api/dashboard/").data["recent_activity"])

    def test_settings_write_via_role_permission(self):
        editor_role = Group.objects.create(name="Settings Editor")
        editor_role.permissions.set([perm("system_settings.change_systemsettings")])
        editor = User.objects.create_user(username="editor", password="pw12345!")
        editor.groups.add(editor_role)
        self.as_user(editor)
        self.assertEqual(self.client.patch("/api/settings/", {"organization_name": "Role Co"}, format="json").status_code, 200)
        self.as_user(self.standard)
        self.assertEqual(self.client.patch("/api/settings/", {"organization_name": "No"}, format="json").status_code, 403)


class DefaultRoleForNewAccountsTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_register_gets_viewer_only(self):
        response = self.client.post(
            "/api/accounts/register/",
            {"username": "newbie", "email": "newbie@example.com", "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = User.objects.get(username="newbie")
        self.assertEqual([g.name for g in user.groups.all()], [roles.ROLE_VIEWER])
        self.assertTrue(user.has_perm("assets.view_asset"))
        for label in ("assets.delete_asset", "assets.add_asset", "system_settings.change_systemsettings",
                      "aduitlog.change_auditlog", "auth.change_group"):
            self.assertFalse(user.has_perm(label), label)

    def test_forgot_password_pending_account_gets_viewer_only(self):
        from unittest import mock

        with mock.patch("accounts.views.issue_otp", return_value=(None, True)):
            response = self.client.post("/api/accounts/forgot-password/", {"email": "pending@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user = User.objects.get(email="pending@example.com")
        self.assertEqual([g.name for g in user.groups.all()], [roles.ROLE_VIEWER])
        self.assertEqual(User.objects.filter(email="pending@example.com").count(), 1)
