from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from aduitlog.models import AuditLog
from catalog.models import Category
from operations.models import Assignment
from organization.models import Vendor
from accounts.testing import grant_role

from .models import Asset, Department, Employee, Location


class AssetCRUDTests(APITestCase):
    """CRUD + validation coverage for /api/assets/ — the "single source of
    truth" endpoint the frontend's Assets module is wired to."""

    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        # Names deliberately distinct from assets/migrations/0004's seed data
        # (which always exists post-migration, including in the test DB) so
        # these fixtures never collide with a pre-existing row of the same
        # name under Department/Location's unique constraint.
        self.category = Category.objects.create(name="QA Laptops", code="QL")
        self.department = Department.objects.create(name="QA Engineering")
        self.location = Location.objects.create(name="QA Test Site")

    def _payload(self, **overrides):
        payload = {
            "name": "Dell Latitude 5440",
            "category": self.category.id,
            "serial_number": "DL123456789",
            "department": self.department.id,
            "location": self.location.id,
            "status": Asset.STATUS_AVAILABLE,
            "condition": Asset.CONDITION_GOOD,
            "warranty_status": Asset.WARRANTY_ACTIVE,
            "cost": "45000.00",
        }
        payload.update(overrides)
        return payload

    def test_list_assets_empty(self):
        response = self.client.get("/api/assets/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_create_asset_generates_code_and_returns_201(self):
        response = self.client.post("/api/assets/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["asset_code"].startswith("AF-QL-"))
        self.assertEqual(response.data["status"], "Available")
        self.assertEqual(Decimal(response.data["current_value"]), Decimal("45000.00"))
        # id/asset_code are backend-generated — never accepted from the client.
        self.assertNotIn("id", self._payload())

    def test_create_asset_rejects_non_positive_cost(self):
        response = self.client.post("/api/assets/", self._payload(cost="0"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cost", response.data)

    def test_create_asset_rejects_bad_serial_format(self):
        response = self.client.post("/api/assets/", self._payload(serial_number="not-a-serial"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("serial_number", response.data)

    def test_create_asset_rejects_duplicate_serial(self):
        self.client.post("/api/assets/", self._payload(), format="json")
        response = self.client.post(
            "/api/assets/", self._payload(name="Second unit"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("serial_number", response.data)

    def test_retrieve_update_delete_asset(self):
        created = self.client.post("/api/assets/", self._payload(), format="json").data
        asset_id = created["id"]

        detail = self.client.get(f"/api/assets/{asset_id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["serial_number"], "DL123456789")

        patched = self.client.patch(f"/api/assets/{asset_id}/", {"status": "In Repair"}, format="json")
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.data["status"], "In Repair")

        deleted = self.client.delete(f"/api/assets/{asset_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Asset.objects.filter(pk=asset_id).exists())

    def test_purchase_date_round_trips_and_is_optional(self):
        """purchase_date (assets/migrations/0011) must survive create/read/update
        through the main /api/assets/ endpoint, not just the separate
        /api/reports/assets/ endpoint — and stay optional/nullable since
        pre-migration assets never had it set."""
        created = self.client.post(
            "/api/assets/", self._payload(purchase_date="2023-05-15"), format="json"
        ).data
        self.assertEqual(created["purchase_date"], "2023-05-15")

        # Omitting it entirely must not error and must read back as null.
        no_date = self.client.post(
            "/api/assets/", self._payload(serial_number="DL999999999"), format="json"
        ).data
        self.assertIsNone(no_date["purchase_date"])

        patched = self.client.patch(
            f"/api/assets/{created['id']}/", {"purchase_date": "2022-01-10"}, format="json"
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.data["purchase_date"], "2022-01-10")

    def test_summary_endpoint_reflects_real_counts(self):
        self.client.post("/api/assets/", self._payload(), format="json")
        self.client.post(
            "/api/assets/",
            self._payload(name="Unit 2", serial_number="DL987654321", status=Asset.STATUS_ASSIGNED),
            format="json",
        )

        response = self.client.get("/api/assets/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_assets"], 2)
        self.assertEqual(response.data["category_count"], 1)
        self.assertEqual(Decimal(response.data["total_cost"]), Decimal("90000.00"))
        status_counts = {row["status"]: row["count"] for row in response.data["status_breakdown"]}
        self.assertEqual(status_counts["Available"], 1)
        self.assertEqual(status_counts["Assigned"], 1)
        self.assertEqual(status_counts["In Repair"], 0)

    def test_assigned_to_resolves_free_text_name_to_employee(self):
        response = self.client.post(
            "/api/assets/", self._payload(assigned_to="Rohit Verma"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["assigned_to"]["name"], "Rohit Verma")
        self.assertTrue(Employee.objects.filter(name="Rohit Verma").exists())

    def test_asset_can_reference_vendor(self):
        vendor = Vendor.objects.create(
            name="Dell Technologies", email="sales@dell.example", vendor_type=Vendor.TYPE_DISTRIBUTOR
        )
        response = self.client.post("/api/assets/", self._payload(vendor=vendor.id), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["vendor"], "Dell Technologies")


class AssetAuditLogIntegrationTests(APITestCase):
    """Confirms Asset CREATE/UPDATE/DELETE automatically produce backend
    AuditLog rows (see aduitlog app + assets/views.py), and that a FAILED
    request never does."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="auditor", password="pw12345!", first_name="Audit", last_name="Tester"
        )
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name="Audit Laptops", code="AL")
        self.department = Department.objects.create(name="Audit Engineering")
        self.location = Location.objects.create(name="Audit Test Site")

    def _payload(self, **overrides):
        payload = {
            "name": "ThinkPad X1",
            "category": self.category.id,
            "serial_number": "LN123456789",
            "department": self.department.id,
            "location": self.location.id,
            "status": Asset.STATUS_AVAILABLE,
            "condition": Asset.CONDITION_GOOD,
            "warranty_status": Asset.WARRANTY_ACTIVE,
            "cost": "60000.00",
        }
        payload.update(overrides)
        return payload

    def test_create_asset_writes_create_audit_log(self):
        response = self.client.post("/api/assets/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        log = AuditLog.objects.get(action=AuditLog.ACTION_CREATE)
        self.assertIn(response.data["asset_code"], log.title)
        self.assertEqual(log.actor_id, self.user.id)
        self.assertEqual(log.actor_name, "Audit Tester")

    def test_failed_create_writes_no_audit_log(self):
        response = self.client.post("/api/assets/", self._payload(cost="0"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(AuditLog.objects.filter(action=AuditLog.ACTION_CREATE).exists())

    def test_update_status_writes_update_audit_log(self):
        created = self.client.post("/api/assets/", self._payload(), format="json").data
        response = self.client.patch(
            f"/api/assets/{created['id']}/", {"status": Asset.STATUS_IN_REPAIR}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        log = AuditLog.objects.filter(action=AuditLog.ACTION_UPDATE).latest("timestamp")
        self.assertIn("status changed to In Repair", log.title)

    def test_update_to_assigned_writes_assign_audit_log(self):
        created = self.client.post("/api/assets/", self._payload(), format="json").data
        response = self.client.patch(
            f"/api/assets/{created['id']}/",
            {"status": Asset.STATUS_ASSIGNED, "assigned_to": "Priya Patel"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        log = AuditLog.objects.filter(action=AuditLog.ACTION_ASSIGN).latest("timestamp")
        self.assertIn("assigned to Priya Patel", log.title)
        self.assertEqual(log.context, self.department.name)

    def test_update_from_assigned_writes_return_audit_log(self):
        created = self.client.post(
            "/api/assets/",
            self._payload(status=Asset.STATUS_ASSIGNED, assigned_to="Karan Mehta"),
            format="json",
        ).data
        response = self.client.patch(
            f"/api/assets/{created['id']}/", {"status": Asset.STATUS_AVAILABLE}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        log = AuditLog.objects.filter(action=AuditLog.ACTION_RETURN).latest("timestamp")
        self.assertIn("returned by Karan Mehta", log.title)

    def test_delete_asset_writes_delete_audit_log(self):
        created = self.client.post("/api/assets/", self._payload(), format="json").data
        response = self.client.delete(f"/api/assets/{created['id']}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        log = AuditLog.objects.get(action=AuditLog.ACTION_DELETE)
        self.assertIn(created["asset_code"], log.title)

    def test_failed_delete_writes_no_delete_audit_log(self):
        """An asset with assignment history can't be deleted (PROTECT) —
        the resulting 400 must not leave a DELETE audit entry behind."""
        created = self.client.post("/api/assets/", self._payload(), format="json").data
        asset = Asset.objects.get(pk=created["id"])
        employee = Employee.objects.create(name="Protected Owner")
        Assignment.objects.create(asset=asset, person=employee, assigned_date="2026-01-01")

        response = self.client.delete(f"/api/assets/{created['id']}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(AuditLog.objects.filter(action=AuditLog.ACTION_DELETE).exists())


class AssetExportImportTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="importexportuser", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name="Import Laptops", code="IL")
        self.department = Department.objects.create(name="Import Engineering")
        self.location = Location.objects.create(name="Import HQ")
        self.asset = Asset.objects.create(
            asset_code="AF-IL-0001",
            name="Dell XPS 15",
            category=self.category,
            serial_number="DL112233445",
            department=self.department,
            location=self.location,
            cost=Decimal("75000.00"),
            status=Asset.STATUS_AVAILABLE,
            condition=Asset.CONDITION_GOOD,
            warranty_status=Asset.WARRANTY_ACTIVE,
        )

    def test_export_csv(self):
        response = self.client.get("/api/assets/export/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn('attachment; filename="assets.csv"', response["Content-Disposition"])
        content = response.content.decode("utf-8")
        self.assertIn("asset_code,name,category,serial_number,department,location,assigned_to,status,condition,cost,warranty_status", content)
        self.assertIn("DL112233445", content)
        self.assertIn("Dell XPS 15", content)

    def test_export_xlsx(self):
        response = self.client.get("/api/assets/export/?file_format=xlsx")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertIn('attachment; filename="assets.xlsx"', response["Content-Disposition"])

    def test_export_xlsx_via_standard_format_query_param(self):
        """?format=xlsx (the standard DRF query param name, as opposed to
        this endpoint's own ?file_format=) must resolve too — previously
        DRF's content negotiation 404'd any `format` value it didn't
        recognize as a registered renderer, before the view ever ran."""
        response = self.client.get("/api/assets/export/?format=xlsx")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertIn('attachment; filename="assets.xlsx"', response["Content-Disposition"])

    def test_export_requires_authentication(self):
        """Export holds the full asset list (incl. assignee names), so an
        unauthenticated client is rejected like every other Asset endpoint."""
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/assets/export/?file_format=xlsx")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_export_succeeds_for_authenticated_user(self):
        response = self.client.get("/api/assets/export/?file_format=xlsx")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    def test_import_csv_creates_new_asset_with_generated_code(self):
        import io
        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_content = (
            "name,category,serial_number,department,location,cost,status,condition,warranty_status\n"
            "ThinkPad T14,Import Laptops,LN998877665,Import Engineering,Import HQ,65000,Available,Good,Active\n"
        )
        file = SimpleUploadedFile("assets.csv", csv_content.encode("utf-8"), content_type="text/csv")
        response = self.client.post("/api/assets/import/", {"file": file}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["failed"], 0)

        imported = Asset.objects.get(serial_number="LN998877665")
        self.assertEqual(imported.name, "ThinkPad T14")
        self.assertTrue(imported.asset_code.startswith("AF-IL-"))

    def test_import_csv_updates_existing_asset_by_serial(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_content = (
            "name,category,serial_number,department,location,cost,status,condition,warranty_status\n"
            "Dell XPS 15 Updated,Import Laptops,DL112233445,Import Engineering,Import HQ,80000,In Repair,Fair,Active\n"
        )
        file = SimpleUploadedFile("assets.csv", csv_content.encode("utf-8"), content_type="text/csv")
        response = self.client.post("/api/assets/import/", {"file": file}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 1)
        self.assertEqual(response.data["created"], 0)

        self.asset.refresh_from_db()
        self.assertEqual(self.asset.name, "Dell XPS 15 Updated")
        self.assertEqual(self.asset.status, Asset.STATUS_IN_REPAIR)
        self.assertEqual(self.asset.cost, Decimal("80000.00"))

    def test_import_reports_row_validation_errors(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_content = (
            "name,category,serial_number,department,location,cost\n"
            "Valid Asset,Import Laptops,DL887766554,Import Engineering,Import HQ,50000\n"
            "Invalid Serial,Import Laptops,invalid-serial,Import Engineering,Import HQ,50000\n"
            "Invalid Cost,Import Laptops,HP112233445,Import Engineering,Import HQ,-100\n"
        )
        file = SimpleUploadedFile("assets.csv", csv_content.encode("utf-8"), content_type="text/csv")
        response = self.client.post("/api/assets/import/", {"file": file}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_207_MULTI_STATUS)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["failed"], 2)
        self.assertEqual(len(response.data["errors"]), 2)
        self.assertEqual(response.data["errors"][0]["row"], 3)
        self.assertIn("Serial number", response.data["errors"][0]["reason"])
        self.assertEqual(response.data["errors"][1]["row"], 4)
        self.assertIn("positive number", response.data["errors"][1]["reason"])


class AssetWarrantyTests(APITestCase):
    """Warranty dates are the source of truth for warranty status."""

    setUp = AssetCRUDTests.setUp
    _payload = AssetCRUDTests._payload

    def test_status_and_days_remaining_derived_from_end_date(self):
        import datetime
        today = datetime.date.today()
        response = self.client.post(
            "/api/assets/",
            self._payload(
                warranty_status=Asset.WARRANTY_ACTIVE,  # ignored: an end date is given
                warranty_start_date=(today - datetime.timedelta(days=300)).isoformat(),
                warranty_end_date=(today + datetime.timedelta(days=30)).isoformat(),
                warranty_provider="  Dell ProSupport ",
            ),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["warranty_status"], Asset.WARRANTY_EXPIRING)
        self.assertEqual(response.data["warranty_days_remaining"], 30)
        self.assertEqual(response.data["warranty_provider"], "Dell ProSupport")

    def test_expired_end_date(self):
        import datetime
        response = self.client.post(
            "/api/assets/",
            self._payload(warranty_end_date=(datetime.date.today() - datetime.timedelta(days=1)).isoformat()),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["warranty_status"], Asset.WARRANTY_EXPIRED)

    def test_end_before_start_rejected(self):
        response = self.client.post(
            "/api/assets/",
            self._payload(warranty_start_date="2026-06-01", warranty_end_date="2026-01-01"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("warranty_end_date", response.data)

    def test_no_end_date_keeps_manual_status_and_null_days(self):
        response = self.client.post(
            "/api/assets/", self._payload(warranty_status=Asset.WARRANTY_EXPIRED), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["warranty_status"], Asset.WARRANTY_EXPIRED)
        self.assertIsNone(response.data["warranty_days_remaining"])

    def test_status_or_end_date_required_on_create(self):
        payload = self._payload()
        payload.pop("warranty_status")
        response = self.client.post("/api/assets/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("warranty_status", response.data)


class AssetWarrantyEdgeCaseTests(APITestCase):
    """Boundary cases for the date-derived warranty status (90-day rule)."""

    setUp = AssetCRUDTests.setUp
    _payload = AssetCRUDTests._payload

    def _create(self, serial, **warranty):
        response = self.client.post("/api/assets/", self._payload(serial_number=serial, **warranty), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def _days(self, n):
        import datetime
        return (datetime.date.today() + datetime.timedelta(days=n)).isoformat()

    def test_end_today_is_expiring_with_zero_days(self):
        data = self._create("DL100000001", warranty_end_date=self._days(0))
        self.assertEqual((data["warranty_status"], data["warranty_days_remaining"]), (Asset.WARRANTY_EXPIRING, 0))

    def test_end_tomorrow_is_expiring(self):
        data = self._create("DL100000002", warranty_end_date=self._days(1))
        self.assertEqual((data["warranty_status"], data["warranty_days_remaining"]), (Asset.WARRANTY_EXPIRING, 1))

    def test_ninety_day_boundary(self):
        self.assertEqual(self._create("DL100000003", warranty_end_date=self._days(90))["warranty_status"],
                         Asset.WARRANTY_EXPIRING)
        self.assertEqual(self._create("DL100000004", warranty_end_date=self._days(91))["warranty_status"],
                         Asset.WARRANTY_ACTIVE)

    def test_yesterday_is_expired(self):
        data = self._create("DL100000005", warranty_end_date=self._days(-1))
        self.assertEqual((data["warranty_status"], data["warranty_days_remaining"]), (Asset.WARRANTY_EXPIRED, -1))

    def test_start_date_only_is_accepted_without_invented_end(self):
        data = self._create("DL100000006", warranty_status=Asset.WARRANTY_ACTIVE, warranty_start_date=self._days(-10))
        self.assertIsNone(data["warranty_end_date"])
        self.assertIsNone(data["warranty_days_remaining"])
        self.assertEqual(data["warranty_status"], Asset.WARRANTY_ACTIVE)

    def test_stale_stored_status_does_not_affect_list_or_sorting(self):
        """An end date that passed after the last save: the stored column
        still says Active, but the list and ?ordering= use the live status."""
        stale = self._create("DL100000007", warranty_end_date=self._days(200))
        fresh = self._create("DL100000008", warranty_end_date=self._days(30))  # Expiring
        # Simulate time passing without a save (bypasses Asset.save()).
        Asset.objects.filter(pk=stale["id"]).update(warranty_end_date=self._days(-5))
        self.assertEqual(Asset.objects.get(pk=stale["id"]).warranty_status, Asset.WARRANTY_ACTIVE)

        listed = self.client.get("/api/assets/?ordering=warranty_status").data["results"]
        order = [(row["id"], row["warranty_status"]) for row in listed]
        # Live values: stale -> Expired, fresh -> Expiring; "Expired" < "Expiring".
        self.assertEqual(order, [(stale["id"], Asset.WARRANTY_EXPIRED), (fresh["id"], Asset.WARRANTY_EXPIRING)])
        desc = self.client.get("/api/assets/?ordering=-warranty_status").data["results"]
        self.assertEqual([row["id"] for row in desc], [fresh["id"], stale["id"]])
