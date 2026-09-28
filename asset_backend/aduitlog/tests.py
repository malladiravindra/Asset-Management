from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.roles import ROLE_STANDARD
from accounts.testing import grant_role

from .models import AuditLog
from .services import create_audit_log


class AuditLogAPITests(APITestCase):
    """Coverage for /api/audit-logs/ — CRUD, filtering, search, pagination,
    authentication, and validation."""

    def setUp(self):
        # Staff by default: POST/PUT/PATCH/DELETE are staff-only (see
        # AuditLogListCreateAPIView / AuditLogDetailAPIView). Normal-user
        # behavior is covered with self.normal below.
        self.user = User.objects.create_user(
            username="tester", email="tester@example.com", password="pw12345!",
            first_name="Test", last_name="User", is_staff=True,
        )
        self.normal = User.objects.create_user(
            username="normal", email="normal@example.com", password="pw12345!",
        )
        # Reading audit history needs aduitlog.view_auditlog; Standard User
        # has it (and no audit write permissions).
        grant_role(self.normal, ROLE_STANDARD)
        self.client.force_authenticate(user=self.user)

    # ---- basic CRUD -------------------------------------------------------

    def test_list_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/audit-logs/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_empty(self):
        response = self.client.get("/api/audit-logs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_create_sets_authenticated_user_as_actor(self):
        response = self.client.post(
            "/api/audit-logs/",
            {"action": "CREATE", "title": "Asset AF-0003 created", "context": "Engineering"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["action"], "CREATE")
        self.assertEqual(response.data["title"], "Asset AF-0003 created")
        self.assertEqual(response.data["actor"], "Test User")
        self.assertEqual(response.data["context"], "Engineering")
        self.assertIn("timestamp", response.data)
        log = AuditLog.objects.get(pk=response.data["id"])
        self.assertEqual(log.actor_id, self.user.id)

    def test_create_ignores_client_supplied_actor(self):
        """A client cannot impersonate another user by sending `actor` —
        the field doesn't exist on the write serializer at all, so it's
        silently ignored and the authenticated request.user is used."""
        response = self.client.post(
            "/api/audit-logs/",
            {"action": "CREATE", "title": "Spoofed entry", "actor": "Someone Else"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["actor"], "Test User")

    def test_get_single_log(self):
        log = create_audit_log(action=AuditLog.ACTION_UPDATE, title="Warranty updated", actor=self.user)
        response = self.client.get(f"/api/audit-logs/{log.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], log.id)
        self.assertEqual(response.data["title"], "Warranty updated")

    def test_get_missing_log_404(self):
        response = self.client.get("/api/audit-logs/999999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # POST/PUT/PATCH/DELETE are staff-only; normal users can only read.

    def test_normal_user_can_read_logs(self):
        log = create_audit_log(action=AuditLog.ACTION_UPDATE, title="Readable", actor=self.user)
        self.client.force_authenticate(user=self.normal)
        self.assertEqual(self.client.get("/api/audit-logs/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/audit-logs/{log.id}/").status_code, status.HTTP_200_OK)

    def test_normal_user_cannot_create_log(self):
        self.client.force_authenticate(user=self.normal)
        response = self.client.post("/api/audit-logs/", {"action": "CREATE", "title": "Injected"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(AuditLog.objects.filter(title="Injected").exists())

    def test_create_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post("/api/audit-logs/", {"action": "CREATE", "title": "x"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_automatic_logging_unaffected_for_normal_users(self):
        """Application-generated entries never go through POST, so a normal
        user's own operations are still logged."""
        log = create_audit_log(action=AuditLog.ACTION_CREATE, title="Asset created by normal user", actor=self.normal)
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.normal)

    def test_normal_user_cannot_modify_or_delete_log(self):
        log = create_audit_log(action=AuditLog.ACTION_UPDATE, title="Immutable", actor=self.user)
        self.client.force_authenticate(user=self.normal)
        url = f"/api/audit-logs/{log.id}/"
        self.assertEqual(self.client.patch(url, {"title": "x"}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.put(url, {"action": "DELETE", "title": "x", "context": ""}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_403_FORBIDDEN)
        log.refresh_from_db()
        self.assertEqual(log.title, "Immutable")

    def test_patch_updates_title(self):
        log = create_audit_log(action=AuditLog.ACTION_UPDATE, title="Original title", actor=self.user)
        response = self.client.patch(f"/api/audit-logs/{log.id}/", {"title": "Corrected title"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["title"], "Corrected title")
        log.refresh_from_db()
        self.assertEqual(log.title, "Corrected title")

    def test_put_replaces_fields(self):
        log = create_audit_log(action=AuditLog.ACTION_UPDATE, title="Original", actor=self.user, context="X")
        response = self.client.put(
            f"/api/audit-logs/{log.id}/",
            {"action": "DELETE", "title": "Replaced", "context": ""},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["action"], "DELETE")
        self.assertEqual(response.data["title"], "Replaced")

    def test_delete_log(self):
        log = create_audit_log(action=AuditLog.ACTION_DELETE, title="To be removed", actor=self.user)
        response = self.client.delete(f"/api/audit-logs/{log.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AuditLog.objects.filter(pk=log.id).exists())

    # ---- filtering / search / pagination -----------------------------------

    def test_filter_by_action(self):
        create_audit_log(action=AuditLog.ACTION_CREATE, title="Created one", actor=self.user)
        create_audit_log(action=AuditLog.ACTION_DELETE, title="Deleted one", actor=self.user)
        response = self.client.get("/api/audit-logs/?action=DELETE")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["action"], "DELETE")

    def test_search_across_title_actor_context(self):
        create_audit_log(action=AuditLog.ACTION_ASSIGN, title="AF-0003 assigned to Priya Patel",
                          actor=self.user, context="Engineering")
        create_audit_log(action=AuditLog.ACTION_RETURN, title="AF-0099 returned by Rohit Verma",
                          actor=self.user, context="Finance")

        by_title = self.client.get("/api/audit-logs/?search=AF-0003")
        self.assertEqual(by_title.data["count"], 1)

        by_context = self.client.get("/api/audit-logs/?search=Engineering")
        self.assertEqual(by_context.data["count"], 1)

        by_actor = self.client.get("/api/audit-logs/?search=Test User")
        self.assertEqual(by_actor.data["count"], 2)

        case_insensitive = self.client.get("/api/audit-logs/?search=engineering")
        self.assertEqual(case_insensitive.data["count"], 1)

    def test_pagination_page_size(self):
        for i in range(10):
            create_audit_log(action=AuditLog.ACTION_UPDATE, title=f"Event {i}", actor=self.user)
        response = self.client.get("/api/audit-logs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 10)
        self.assertEqual(len(response.data["results"]), 8)  # default page_size=8
        self.assertIsNotNone(response.data["next"])

        page_2 = self.client.get(response.data["next"])
        self.assertEqual(len(page_2.data["results"]), 2)

    def test_ordering_is_newest_first(self):
        first = create_audit_log(action=AuditLog.ACTION_CREATE, title="First", actor=self.user)
        second = create_audit_log(action=AuditLog.ACTION_CREATE, title="Second", actor=self.user)
        response = self.client.get("/api/audit-logs/")
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [second.id, first.id])

    # ---- validation ---------------------------------------------------------

    def test_invalid_action_rejected(self):
        response = self.client.post(
            "/api/audit-logs/", {"action": "EXPLODE", "title": "Bad action"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("action", response.data)

    def test_empty_title_rejected(self):
        response = self.client.post(
            "/api/audit-logs/", {"action": "CREATE", "title": "   "}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("title", response.data)

    def test_missing_title_rejected(self):
        response = self.client.post("/api/audit-logs/", {"action": "CREATE"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("title", response.data)

    def test_context_is_optional(self):
        response = self.client.post(
            "/api/audit-logs/", {"action": "CREATE", "title": "No context here"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["context"], "")

    def test_timestamp_is_server_generated_and_read_only(self):
        response = self.client.post(
            "/api/audit-logs/",
            {"action": "CREATE", "title": "Ignore client timestamp", "timestamp": "2000-01-01T00:00:00Z"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # The client-supplied timestamp is silently ignored (not a field on
        # AuditLogWriteSerializer) — the response's timestamp is real/now,
        # not the year-2000 value that was sent.
        self.assertFalse(response.data["timestamp"].startswith("2000-01-01"))


class AuditLogServiceTests(APITestCase):
    """create_audit_log() is the one place every backend operation should
    go through — cover its own validation independent of the HTTP layer."""

    def test_rejects_unknown_action(self):
        with self.assertRaises(ValueError):
            create_audit_log(action="NOT_REAL", title="x")

    def test_rejects_empty_title(self):
        with self.assertRaises(ValueError):
            create_audit_log(action=AuditLog.ACTION_CREATE, title="   ")

    def test_actor_none_records_system(self):
        log = create_audit_log(action=AuditLog.ACTION_CREATE, title="System event", actor=None)
        self.assertIsNone(log.actor_id)
        self.assertEqual(log.actor_name, "System")
