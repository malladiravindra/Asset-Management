import threading
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TransactionTestCase
from rest_framework import status
from rest_framework.test import APITestCase

from aduitlog.models import AuditLog
from assets.models import Asset, Department, Employee, Location
from catalog.models import Category
from organization.models import Vendor
from accounts.testing import grant_role

from . import services
from .models import Assignment


class AssignmentReturnAuditLogIntegrationTests(APITestCase):
    """Confirms Assignment/Return operations automatically produce backend
    AuditLog rows (ASSIGN / RETURN — see operations/services.py), and that
    a failed request never does."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="ops-auditor", password="pw12345!", first_name="Ops", last_name="Tester"
        )
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name="Ops Laptops", code="OL")
        self.department = Department.objects.create(name="Ops Engineering")
        self.location = Location.objects.create(name="Ops Test Site")
        self.employee = Employee.objects.create(
            name="Priya Patel", department=self.department, location=self.location
        )
        self.asset = Asset.objects.create(
            asset_code="AF-OL-0001",
            name="ThinkPad X1",
            category=self.category,
            serial_number="LN000000001",
            department=self.department,
            location=self.location,
            status=Asset.STATUS_AVAILABLE,
            cost="60000.00",
        )

    def test_create_assignment_writes_assign_audit_log(self):
        response = self.client.post(
            "/api/operations/assignments/",
            {"asset": self.asset.id, "person": self.employee.id, "assigned_date": "2026-01-15"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        log = AuditLog.objects.get(action=AuditLog.ACTION_ASSIGN)
        self.assertEqual(log.title, "AF-OL-0001 assigned to Priya Patel")
        self.assertEqual(log.context, "Ops Engineering")
        self.assertEqual(log.actor_id, self.user.id)

    def test_duplicate_assignment_fails_and_writes_no_audit_log(self):
        Assignment.objects.create(asset=self.asset, person=self.employee, assigned_date="2026-01-01")

        response = self.client.post(
            "/api/operations/assignments/",
            {"asset": self.asset.id, "person": self.employee.id, "assigned_date": "2026-01-15"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(AuditLog.objects.filter(action=AuditLog.ACTION_ASSIGN).exists())

    def test_process_return_writes_return_audit_log(self):
        create_response = self.client.post(
            "/api/operations/assignments/",
            {"asset": self.asset.id, "person": self.employee.id, "assigned_date": "2026-01-15"},
            format="json",
        )
        assignment_id = create_response.data["id"]

        response = self.client.post(
            "/api/operations/returns/",
            {"assignment": assignment_id, "condition": "Good", "reason": "End of project"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        log = AuditLog.objects.get(action=AuditLog.ACTION_RETURN)
        self.assertEqual(log.title, "AF-OL-0001 returned by Priya Patel")
        self.assertEqual(log.actor_id, self.user.id)

    def test_return_of_already_returned_assignment_fails_and_writes_no_audit_log(self):
        create_response = self.client.post(
            "/api/operations/assignments/",
            {"asset": self.asset.id, "person": self.employee.id, "assigned_date": "2026-01-15"},
            format="json",
        )
        assignment_id = create_response.data["id"]
        self.client.post("/api/operations/returns/", {"assignment": assignment_id}, format="json")
        AuditLog.objects.filter(action=AuditLog.ACTION_RETURN).delete()  # isolate the second attempt

        response = self.client.post("/api/operations/returns/", {"assignment": assignment_id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(AuditLog.objects.filter(action=AuditLog.ACTION_RETURN).exists())


class PurchaseOrderGstAndVendorEchoTests(APITestCase):
    """Confirms the previously-frontend-only gst_rate/tax and vendor detail
    fields (company name/email/phone/address) are now real, computed from
    the backend — see operations.models.PurchaseOrder.gst_rate and
    operations.serializers.PurchaseOrderSerializer."""

    def setUp(self):
        self.user = User.objects.create_user(username="po-tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        self.vendor = Vendor.objects.create(
            name="Ingram Micro",
            email="sales@ingram.example",
            vendor_type=Vendor.TYPE_DISTRIBUTOR,
            company_name="Ingram Micro Inc.",
            phone="+91 80000 11111",
            address="Electronic City, Bengaluru",
        )
        self.department = Department.objects.create(name="PO Test Department")
        self.employee = Employee.objects.create(name="PO Test Requester", department=self.department)

    def _payload(self, **overrides):
        payload = {
            "vendor": self.vendor.name,
            "department": self.department.name,
            "requested_by": self.employee.name,
            "expected_date": "2026-02-01",
            "gst_rate": "18.00",
            "items": [{"name": "Dell Latitude 5440", "category": "Laptops", "quantity": 2, "unit_cost": "50000.00"}],
        }
        payload.update(overrides)
        return payload

    def test_create_computes_tax_and_total_from_gst_rate(self):
        response = self.client.post("/api/operations/purchase-orders/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Decimal(response.data["subtotal"]), Decimal("100000.00"))
        self.assertEqual(Decimal(response.data["tax"]), Decimal("18000.00"))
        self.assertEqual(Decimal(response.data["total"]), Decimal("118000.00"))

    def test_create_echoes_vendor_detail_fields(self):
        response = self.client.post("/api/operations/purchase-orders/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["vendor_company_name"], "Ingram Micro Inc.")
        self.assertEqual(response.data["vendor_phone"], "+91 80000 11111")
        self.assertEqual(response.data["vendor_address"], "Electronic City, Bengaluru")

    def test_gst_rate_defaults_to_zero_tax(self):
        response = self.client.post(
            "/api/operations/purchase-orders/", self._payload(gst_rate=None), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Decimal(response.data["tax"]), Decimal("0"))

    def test_rejects_negative_gst_rate(self):
        response = self.client.post(
            "/api/operations/purchase-orders/", self._payload(gst_rate="-5.00"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("gst_rate", response.data)

    def test_vendor_fields_stay_in_sync_after_vendor_update(self):
        """vendor_company_name etc. are derived live, not snapshotted at
        create time — updating the Vendor changes what a subsequent GET
        on the PO reports."""
        created = self.client.post("/api/operations/purchase-orders/", self._payload(), format="json")
        po_id = created.data["id"]

        self.vendor.company_name = "Ingram Micro (Renamed) Inc."
        self.vendor.save(update_fields=["company_name"])

        fetched = self.client.get(f"/api/operations/purchase-orders/{po_id}/")
        self.assertEqual(fetched.data["vendor_company_name"], "Ingram Micro (Renamed) Inc.")


class AssignmentPatchSyncsAssetStateTests(APITestCase):
    """Confirms PATCH/PUT on an existing Assignment keeps Asset.status/
    assigned_to in sync for BOTH the old and new asset — the bug where
    AssignmentSerializer had no update() override, so DRF's default
    ModelSerializer.update() just saved the Assignment row and left
    Asset.status/assigned_to stale (see operations.services.update_assignment
    and AssignmentSerializer.validate/update)."""

    def setUp(self):
        self.user = User.objects.create_user(username="ops-patcher", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name="Patch Laptops", code="PL")
        self.department = Department.objects.create(name="Patch Engineering")
        self.location = Location.objects.create(name="Patch Test Site")

        self.employee_a = Employee.objects.create(
            name="Asha Rao", department=self.department, location=self.location
        )
        self.employee_b = Employee.objects.create(
            name="Bala Krishnan", department=self.department, location=self.location
        )
        self.asset_a = Asset.objects.create(
            asset_code="AF-PL-0001", name="ThinkPad A", category=self.category,
            serial_number="PLA0000001", department=self.department, location=self.location,
            status=Asset.STATUS_AVAILABLE, cost="60000.00",
        )
        self.asset_b = Asset.objects.create(
            asset_code="AF-PL-0002", name="ThinkPad B", category=self.category,
            serial_number="PLB0000001", department=self.department, location=self.location,
            status=Asset.STATUS_AVAILABLE, cost="65000.00",
        )

    def _assign(self, asset, person, assigned_date="2026-01-15"):
        response = self.client.post(
            "/api/operations/assignments/",
            {"asset": asset.id, "person": person.id, "assigned_date": assigned_date},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data["id"]

    def test_patch_reassigns_both_asset_and_person(self):
        assignment_id = self._assign(self.asset_a, self.employee_a)

        response = self.client.patch(
            f"/api/operations/assignments/{assignment_id}/",
            {"asset": self.asset_b.id, "person": self.employee_b.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.asset_a.refresh_from_db()
        self.asset_b.refresh_from_db()
        self.assertEqual(self.asset_a.status, Asset.STATUS_AVAILABLE)
        self.assertIsNone(self.asset_a.assigned_to_id)
        self.assertEqual(self.asset_b.status, Asset.STATUS_ASSIGNED)
        self.assertEqual(self.asset_b.assigned_to_id, self.employee_b.id)

    def test_patch_reassigns_person_only_keeps_asset_assigned(self):
        assignment_id = self._assign(self.asset_a, self.employee_a)

        response = self.client.patch(
            f"/api/operations/assignments/{assignment_id}/",
            {"person": self.employee_b.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.asset_a.refresh_from_db()
        self.assertEqual(self.asset_a.status, Asset.STATUS_ASSIGNED)
        self.assertEqual(self.asset_a.assigned_to_id, self.employee_b.id)

    def test_patch_reassigns_asset_only_same_person(self):
        assignment_id = self._assign(self.asset_a, self.employee_a)

        response = self.client.patch(
            f"/api/operations/assignments/{assignment_id}/",
            {"asset": self.asset_b.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.asset_a.refresh_from_db()
        self.asset_b.refresh_from_db()
        self.assertEqual(self.asset_a.status, Asset.STATUS_AVAILABLE)
        self.assertIsNone(self.asset_a.assigned_to_id)
        self.assertEqual(self.asset_b.status, Asset.STATUS_ASSIGNED)
        self.assertEqual(self.asset_b.assigned_to_id, self.employee_a.id)

    def test_patch_onto_asset_already_actively_assigned_elsewhere_is_rejected(self):
        assignment_id = self._assign(self.asset_a, self.employee_a)
        # asset_b is already actively held by a different Assignment record.
        self._assign(self.asset_b, self.employee_b)

        response = self.client.patch(
            f"/api/operations/assignments/{assignment_id}/",
            {"asset": self.asset_b.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("asset", response.data)

        # No partial writes: both assets and the original Assignment are untouched.
        self.asset_a.refresh_from_db()
        self.asset_b.refresh_from_db()
        assignment = Assignment.objects.get(pk=assignment_id)
        self.assertEqual(self.asset_a.status, Asset.STATUS_ASSIGNED)
        self.assertEqual(self.asset_a.assigned_to_id, self.employee_a.id)
        self.assertEqual(self.asset_b.status, Asset.STATUS_ASSIGNED)
        self.assertEqual(self.asset_b.assigned_to_id, self.employee_b.id)
        self.assertEqual(assignment.asset_id, self.asset_a.id)
        self.assertEqual(assignment.person_id, self.employee_a.id)

    def test_noop_field_patch_does_not_touch_asset_state(self):
        assignment_id = self._assign(self.asset_a, self.employee_a)

        response = self.client.patch(
            f"/api/operations/assignments/{assignment_id}/",
            {"assigned_date": "2026-01-20"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.asset_a.refresh_from_db()
        self.assertEqual(self.asset_a.status, Asset.STATUS_ASSIGNED)
        self.assertEqual(self.asset_a.assigned_to_id, self.employee_a.id)
        assignment = Assignment.objects.get(pk=assignment_id)
        self.assertEqual(str(assignment.assigned_date), "2026-01-20")


class HistoricalAssignmentEditDoesNotTouchAssetTests(APITestCase):
    """Scenario C — confirms the was_active guard in
    operations.services.update_assignment: editing an already-Returned
    (historical) Assignment's own fields must save normally, but must
    never reach out and flip whatever Asset now holds its old asset id,
    since that asset may since have been picked up by a completely
    different, unrelated Assignment (which is exactly what this test sets
    up, to make sure a regression here would be caught)."""

    def setUp(self):
        self.user = User.objects.create_user(username="ops-historian", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name="Hist Laptops", code="HL")
        self.department = Department.objects.create(name="Hist Engineering")
        self.location = Location.objects.create(name="Hist Test Site")
        self.employee_a = Employee.objects.create(
            name="Hist Employee A", department=self.department, location=self.location
        )
        self.employee_b = Employee.objects.create(
            name="Hist Employee B", department=self.department, location=self.location
        )
        self.asset_old = Asset.objects.create(
            asset_code="AF-HL-0001", name="Old Laptop", category=self.category,
            serial_number="HL0000001", department=self.department, location=self.location,
            status=Asset.STATUS_AVAILABLE, cost="50000.00",
        )
        self.asset_new = Asset.objects.create(
            asset_code="AF-HL-0002", name="New Laptop", category=self.category,
            serial_number="HL0000002", department=self.department, location=self.location,
            status=Asset.STATUS_AVAILABLE, cost="55000.00",
        )

        # A first Assignment on asset_old that gets returned (becomes
        # historical) ...
        create = self.client.post(
            "/api/operations/assignments/",
            {"asset": self.asset_old.id, "person": self.employee_a.id, "assigned_date": "2026-01-01"},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.data)
        self.historical_assignment_id = create.data["id"]
        return_response = self.client.post(
            "/api/operations/returns/", {"assignment": self.historical_assignment_id}, format="json"
        )
        self.assertEqual(return_response.status_code, status.HTTP_201_CREATED, return_response.data)

        # ... then asset_old is picked up again by a brand new, unrelated
        # active Assignment — this is the live state the historical edit
        # below must not disturb.
        reclaim = self.client.post(
            "/api/operations/assignments/",
            {"asset": self.asset_old.id, "person": self.employee_b.id, "assigned_date": "2026-02-01"},
            format="json",
        )
        self.assertEqual(reclaim.status_code, status.HTTP_201_CREATED, reclaim.data)
        self.active_assignment_id = reclaim.data["id"]

    def test_editing_returned_assignment_does_not_disturb_current_holder_of_its_old_asset(self):
        response = self.client.patch(
            f"/api/operations/assignments/{self.historical_assignment_id}/",
            {"asset": self.asset_new.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.asset_old.refresh_from_db()
        self.asset_new.refresh_from_db()
        # asset_old must still show its real, unrelated active holder —
        # the historical edit must not have touched it at all.
        self.assertEqual(self.asset_old.status, Asset.STATUS_ASSIGNED)
        self.assertEqual(self.asset_old.assigned_to_id, self.employee_b.id)
        # asset_new must not have been claimed either — the historical
        # Assignment is not active, so update_assignment never syncs Asset
        # state for it.
        self.assertEqual(self.asset_new.status, Asset.STATUS_AVAILABLE)
        self.assertIsNone(self.asset_new.assigned_to_id)

        # The historical Assignment row's own fields are still editable —
        # just without any Asset-side side effects.
        historical = Assignment.objects.get(pk=self.historical_assignment_id)
        self.assertEqual(historical.asset_id, self.asset_new.id)
        self.assertEqual(historical.status, Assignment.STATUS_UNASSIGNED)

        # And the unrelated active Assignment/Asset pair is completely
        # untouched.
        active = Assignment.objects.get(pk=self.active_assignment_id)
        self.assertEqual(active.asset_id, self.asset_old.id)
        self.assertEqual(active.status, Assignment.STATUS_ASSIGNED)


class AssignmentConcurrencyTests(TransactionTestCase):
    """Scenario B — exercises operations.services.create_assignment's new
    select_for_update()-based locking under REAL concurrent database
    access. Deliberately a TransactionTestCase, not APITestCase/TestCase:
    those wrap each test in one outer transaction that's rolled back (not
    committed) at the end, so two threads "inside" it would just see each
    other's uncommitted writes for free — that doesn't exercise real row
    locking at all. TransactionTestCase gives each thread its own real
    connection with real commits, which is the only way to actually make
    select_for_update() do something.

    Runs against operations.services directly (not through the HTTP
    client) — this is deliberate, not a shortcut: AssignmentSerializer.
    validate()'s pre-lock fast-path check, and the views' post-save
    re-fetch-by-pk, both run their own independent SELECTs outside of
    services.py's locked transaction, and under genuine multi-threaded
    contention on this SQLite dev database those unrelated, pre-existing
    reads can themselves intermittently raise sqlite3's "database table is
    locked" (a known SQLite/Django limitation of the shared-cache in-memory
    test database — see the report). That's a pre-existing characteristic
    of testing raw concurrency against SQLite in general, not something
    this task's asset-row locking changes; calling straight into
    services.create_assignment isolates the test to exactly the code this
    task changed, which is what actually needs to be proven race-safe.

    IMPORTANT — SQLite vs. production: SQLite has no row-level locking
    (select_for_update() is a documented no-op there — see the docstrings
    in services.py), so this test passing here relies on
    operations.services' retry-on-locked wrapper recovering from SQLite's
    own coarse table-level write contention with a fresh re-check, not on
    a real row lock. On Postgres/MySQL — the backends select_for_update()
    actually protects — the same two threads are serialized directly by
    the real row lock, deterministically, every time."""

    def test_two_concurrent_creates_for_the_same_asset_only_one_succeeds(self):
        category = Category.objects.create(name="Concurrency Cat", code="CC")
        department = Department.objects.create(name="Concurrency Dept")
        location = Location.objects.create(name="Concurrency Site")
        employee_a = Employee.objects.create(name="Race A", department=department, location=location)
        employee_b = Employee.objects.create(name="Race B", department=department, location=location)
        asset = Asset.objects.create(
            asset_code="AF-CC-0001", name="Contested Laptop", category=category,
            serial_number="CC0000001", department=department, location=location,
            status=Asset.STATUS_AVAILABLE, cost="70000.00",
        )

        results = {}
        barrier = threading.Barrier(2)

        def attempt_claim(key, employee):
            from django.db import connections  # local import: runs in a worker thread

            barrier.wait()  # release both threads into the critical section together
            try:
                assignment = services.create_assignment(
                    asset=asset, person=employee, assigned_date="2026-03-01"
                )
                results[key] = ("success", assignment.id)
            except services.AssetAlreadyAssignedError:
                results[key] = ("conflict", None)
            finally:
                # Each thread gets its own DB connection under Django's
                # thread-local connection handling — close it explicitly
                # rather than leaking it past the end of the test.
                connections.close_all()

        t1 = threading.Thread(target=attempt_claim, args=("t1", employee_a))
        t2 = threading.Thread(target=attempt_claim, args=("t2", employee_b))
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)

        outcomes = [results.get("t1"), results.get("t2")]
        self.assertNotIn(None, outcomes, f"a worker thread did not finish in time: {results}")
        successes = [o for o in outcomes if o[0] == "success"]
        conflicts = [o for o in outcomes if o[0] == "conflict"]
        self.assertEqual(len(successes), 1, f"expected exactly one winner, got: {results}")
        self.assertEqual(len(conflicts), 1, f"expected exactly one controlled conflict, got: {results}")

        # No partial/inconsistent writes: exactly one active Assignment
        # exists for the asset, and Asset.status/assigned_to match it.
        asset.refresh_from_db()
        active_assignments = Assignment.objects.filter(asset=asset, status=Assignment.STATUS_ASSIGNED)
        self.assertEqual(active_assignments.count(), 1)
        winning_assignment = active_assignments.get()
        self.assertEqual(winning_assignment.id, successes[0][1])
        self.assertEqual(asset.status, Asset.STATUS_ASSIGNED)
        self.assertEqual(asset.assigned_to_id, winning_assignment.person_id)


class ReturnNumberTests(APITestCase):
    setUp = AssignmentReturnAuditLogIntegrationTests.setUp

    def test_return_gets_server_generated_number(self):
        assignment_id = self.client.post(
            "/api/operations/assignments/",
            {"asset": self.asset.id, "person": self.employee.id, "assigned_date": "2026-01-15"},
            format="json",
        ).data["id"]
        response = self.client.post("/api/operations/returns/", {"assignment": assignment_id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        listed = self.client.get("/api/operations/returns/").data["results"]
        self.assertEqual(listed[0]["return_number"], "RET-001")
