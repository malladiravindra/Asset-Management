from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from assets.models import Asset, Department, Employee, Location
from catalog.models import Category
from accounts.testing import grant_role

from .models import Accessory, AccessoryAssignment, MaintenanceRecord, RepairRecord, SoftwareLicense


class OperationAPITestCase(APITestCase):
    """Shared fixtures for the four operation/ resources — a real Asset,
    since Maintenance/Repairs FK to it (see MaintenanceRecord/RepairRecord's
    docstrings in operation/models.py)."""

    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        # "QA " prefix keeps these distinct from assets/migrations/0004's
        # seeded Department/Location rows (see assets/tests.py's own note).
        self.category = Category.objects.create(name="QA Laptops Ops", code="QO")
        self.department = Department.objects.create(name="QA Ops Dept")
        self.location = Location.objects.create(name="QA Ops Site")
        self.asset = Asset.objects.create(
            asset_code="AF-QO-0001",
            name="Dell Latitude 5440",
            category=self.category,
            serial_number="DL999999999",
            department=self.department,
            location=self.location,
            cost=45000,
        )


class MaintenanceCRUDTests(OperationAPITestCase):
    def _payload(self, **overrides):
        import datetime
        payload = {
            "asset": self.asset.id,
            "type": MaintenanceRecord.TYPE_PREVENTIVE,
            "technician": "Suresh Pillai",
            "priority": MaintenanceRecord.PRIORITY_MEDIUM,
            "scheduled_date": (datetime.date.today() + datetime.timedelta(days=7)).isoformat(),
            "status": MaintenanceRecord.STATUS_SCHEDULED,
            "cost": "500.00",
            "notes": "Routine check.",
        }
        payload.update(overrides)
        return payload

    def test_create_returns_asset_snapshot_fields(self):
        response = self.client.post("/api/operation/maintenance/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["asset_tag"], "AF-QO-0001")
        self.assertEqual(response.data["asset_name"], "Dell Latitude 5440")
        self.assertEqual(response.data["category"], "QA Laptops Ops")
        self.assertEqual(response.data["location"], "QA Ops Site")
        self.assertEqual(response.data["display_status"], "Scheduled")

    def test_overdue_is_computed_not_stored(self):
        response = self.client.post(
            "/api/operation/maintenance/",
            self._payload(scheduled_date="2020-01-01", status=MaintenanceRecord.STATUS_SCHEDULED),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], "Scheduled")
        self.assertEqual(response.data["display_status"], "Overdue")

    def test_rejects_negative_cost(self):
        response = self.client.post(
            "/api/operation/maintenance/", self._payload(cost="-5"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cost", response.data)

    def test_list_retrieve_update_delete(self):
        created = self.client.post("/api/operation/maintenance/", self._payload(), format="json").data
        record_id = created["id"]

        listed = self.client.get("/api/operation/maintenance/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 1)

        retrieved = self.client.get(f"/api/operation/maintenance/{record_id}/")
        self.assertEqual(retrieved.status_code, status.HTTP_200_OK)

        updated = self.client.patch(
            f"/api/operation/maintenance/{record_id}/",
            {"status": MaintenanceRecord.STATUS_COMPLETED, "completed_date": "2026-09-11"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["status"], "Completed")

        deleted = self.client.delete(f"/api/operation/maintenance/{record_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(MaintenanceRecord.objects.filter(pk=record_id).exists())


class RepairCRUDTests(OperationAPITestCase):
    def _payload(self, **overrides):
        payload = {
            "asset": self.asset.id,
            "issue_type": RepairRecord.ISSUE_SCREEN_DAMAGE,
            "issue": "Screen cracked after drop",
            "vendor": "Dell Service Center",
            "priority": RepairRecord.PRIORITY_HIGH,
            "under_warranty": False,
            "cost": "4500.00",
            "reported_date": "2026-09-01",
            "expected_return_date": "2026-09-08",
            "status": RepairRecord.STATUS_REPORTED,
        }
        payload.update(overrides)
        return payload

    def test_create_generates_repair_id(self):
        response = self.client.post("/api/operation/repairs/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["repair_id"].startswith("REP-"))
        self.assertEqual(response.data["asset_tag"], "AF-QO-0001")

    def test_rejects_expected_return_before_reported(self):
        response = self.client.post(
            "/api/operation/repairs/",
            self._payload(reported_date="2026-09-10", expected_return_date="2026-09-01"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expected_return_date", response.data)

    def test_list_retrieve_update_delete(self):
        created = self.client.post("/api/operation/repairs/", self._payload(), format="json").data
        record_id = created["id"]

        listed = self.client.get("/api/operation/repairs/")
        self.assertEqual(listed.data["count"], 1)

        updated = self.client.patch(
            f"/api/operation/repairs/{record_id}/", {"status": RepairRecord.STATUS_COMPLETED}, format="json"
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)

        deleted = self.client.delete(f"/api/operation/repairs/{record_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(RepairRecord.objects.filter(pk=record_id).exists())


class AccessoryCRUDTests(OperationAPITestCase):
    def _payload(self, **overrides):
        payload = {
            "name": "Logitech MX Master 3",
            "category": "Mouse",
            "brand": "Logitech",
            "total_qty": 20,
            "assigned_qty": 12,
            "reorder_threshold": 3,
            "reorder_qty": 10,
            "unit_cost": "7500.00",
            "vendor": "Ingram Micro",
            "location": self.location.id,
            "condition": Accessory.CONDITION_GOOD,
            "item_status": Accessory.STATUS_ACTIVE,
        }
        payload.update(overrides)
        return payload

    def test_create_generates_sku_when_blank(self):
        response = self.client.post("/api/operation/accessories/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["sku"].startswith("MS-"))
        self.assertEqual(response.data["available_qty"], 8)
        self.assertEqual(response.data["stock_status"], "In Stock")
        self.assertEqual(response.data["location_name"], "QA Ops Site")

    def test_rejects_assigned_exceeding_total(self):
        response = self.client.post(
            "/api/operation/accessories/", self._payload(total_qty=5, assigned_qty=10), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assigned_qty", response.data)

    def test_rejects_duplicate_sku(self):
        self.client.post("/api/operation/accessories/", self._payload(sku="MS-999"), format="json")
        response = self.client.post(
            "/api/operation/accessories/", self._payload(sku="MS-999", name="Different item"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sku", response.data)

    def test_list_retrieve_update_delete(self):
        created = self.client.post("/api/operation/accessories/", self._payload(), format="json").data
        item_id = created["id"]

        listed = self.client.get("/api/operation/accessories/")
        self.assertEqual(listed.data["count"], 1)

        updated = self.client.patch(
            f"/api/operation/accessories/{item_id}/", {"assigned_qty": 20}, format="json"
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["available_qty"], 0)
        self.assertEqual(updated.data["stock_status"], "Out of Stock")

        deleted = self.client.delete(f"/api/operation/accessories/{item_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Accessory.objects.filter(pk=item_id).exists())


class AccessoryAssignmentAPITests(OperationAPITestCase):
    def setUp(self):
        super().setUp()
        self.employee = Employee.objects.create(
            name="Rohit Sharma", department=self.department, location=self.location
        )
        self.accessory = Accessory.objects.create(
            sku="MS-001",
            name="HP USB Mouse",
            category="Mouse",
            total_qty=20,
            assigned_qty=0,
            unit_cost="500.00",
        )

    def _payload(self, **overrides):
        payload = {
            "accessory": self.accessory.id,
            "employee": self.employee.id,
            "quantity": 1,
            "assigned_date": "2026-09-10",
            "notes": "Issued along with laptop.",
        }
        payload.update(overrides)
        return payload

    def test_create_increments_accessory_assigned_qty(self):
        response = self.client.post("/api/operation/accessory-assignments/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["accessory_sku"], "MS-001")
        self.assertEqual(response.data["accessory_name"], "HP USB Mouse")
        self.assertEqual(response.data["employee_name"], "Rohit Sharma")
        self.assertEqual(response.data["department"], "QA Ops Dept")
        self.assertEqual(response.data["status"], "Assigned")
        self.accessory.refresh_from_db()
        self.assertEqual(self.accessory.assigned_qty, 1)

    def test_rejects_quantity_exceeding_available(self):
        response = self.client.post(
            "/api/operation/accessory-assignments/", self._payload(quantity=25), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("quantity", response.data)
        self.accessory.refresh_from_db()
        self.assertEqual(self.accessory.assigned_qty, 0)

    def test_rejects_zero_and_negative_quantity(self):
        for bad_quantity in (0, -1):
            response = self.client.post(
                "/api/operation/accessory-assignments/", self._payload(quantity=bad_quantity), format="json"
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_repeated_assignment_to_same_employee_keeps_both_history_rows_and_sums_qty(self):
        first = self.client.post("/api/operation/accessory-assignments/", self._payload(quantity=1), format="json")
        second = self.client.post("/api/operation/accessory-assignments/", self._payload(quantity=1), format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED, second.data)

        self.accessory.refresh_from_db()
        self.assertEqual(self.accessory.assigned_qty, 2)
        self.assertEqual(AccessoryAssignment.objects.filter(employee=self.employee).count(), 2)

        listed = self.client.get(f"/api/operation/accessory-assignments/?employee={self.employee.id}")
        self.assertEqual(listed.data["count"], 2)

    def test_filter_by_employee_excludes_other_employees(self):
        other_employee = Employee.objects.create(name="Someone Else")
        self.client.post("/api/operation/accessory-assignments/", self._payload(), format="json")
        self.client.post(
            "/api/operation/accessory-assignments/",
            self._payload(employee=other_employee.id),
            format="json",
        )
        listed = self.client.get(f"/api/operation/accessory-assignments/?employee={self.employee.id}")
        self.assertEqual(listed.data["count"], 1)
        self.assertEqual(listed.data["results"][0]["employee_name"], "Rohit Sharma")


class SoftwareLicenseCRUDTests(OperationAPITestCase):
    def _payload(self, **overrides):
        payload = {
            "name": "Slack Business+",
            "vendor": "Slack",
            "category": SoftwareLicense.CATEGORY_COMMUNICATION,
            "license_type": SoftwareLicense.TYPE_MONTHLY,
            "total_seats": 60,
            "seats_used": 40,
            "purchase_date": "2026-01-01",
            "expiry_date": "2026-10-01",
            "auto_renew": True,
            "cost": "21000.00",
        }
        payload.update(overrides)
        return payload

    def test_create_generates_license_id_and_key(self):
        response = self.client.post("/api/operation/software-licenses/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["license_id"].startswith("LIC-"))
        self.assertTrue(response.data["license_key"])
        self.assertEqual(response.data["available_seats"], 20)
        self.assertAlmostEqual(response.data["utilization_pct"], 66.7, places=1)

    def test_perpetual_clears_expiry_date(self):
        response = self.client.post(
            "/api/operation/software-licenses/",
            self._payload(license_type=SoftwareLicense.TYPE_PERPETUAL, expiry_date="2026-10-01"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIsNone(response.data["expiry_date"])
        self.assertEqual(response.data["status"], "Perpetual")

    def test_rejects_seats_used_exceeding_total(self):
        response = self.client.post(
            "/api/operation/software-licenses/",
            self._payload(total_seats=10, seats_used=15),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("seats_used", response.data)

    def test_requires_expiry_date_unless_perpetual(self):
        payload = self._payload()
        del payload["expiry_date"]
        response = self.client.post("/api/operation/software-licenses/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expiry_date", response.data)

    def test_list_retrieve_update_delete(self):
        created = self.client.post(
            "/api/operation/software-licenses/", self._payload(), format="json"
        ).data
        license_id = created["id"]

        listed = self.client.get("/api/operation/software-licenses/")
        self.assertEqual(listed.data["count"], 1)

        updated = self.client.patch(
            f"/api/operation/software-licenses/{license_id}/", {"seats_used": 55}, format="json"
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["available_seats"], 5)

        deleted = self.client.delete(f"/api/operation/software-licenses/{license_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(SoftwareLicense.objects.filter(pk=license_id).exists())


class AssetServiceStatusSyncTests(OperationAPITestCase):
    """Repair/Maintenance and the asset's status change in one backend
    transaction (operation.services.sync_asset_service_status)."""

    def _repair(self, **overrides):
        payload = {
            "asset": self.asset.id, "issue_type": RepairRecord.ISSUE_BATTERY, "issue": "Battery swelling",
            "vendor": "Service Center", "priority": RepairRecord.PRIORITY_MEDIUM, "under_warranty": False,
            "cost": "1500.00", "reported_date": "2026-09-01", "expected_return_date": "2026-09-08",
        }
        payload.update(overrides)
        return self.client.post("/api/operation/repairs/", payload, format="json")

    def _maintenance(self, **overrides):
        payload = {
            "asset": self.asset.id, "type": MaintenanceRecord.TYPE_INSPECTION, "technician": "Ravi",
            "priority": MaintenanceRecord.PRIORITY_LOW, "scheduled_date": "2026-09-01",
        }
        payload.update(overrides)
        return self.client.post("/api/operation/maintenance/", payload, format="json")

    def _asset_status(self):
        self.asset.refresh_from_db()
        return self.asset.status

    def test_repair_started_and_completed(self):
        created = self._repair()
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(self._asset_status(), Asset.STATUS_IN_REPAIR)

        done = self.client.patch(
            f"/api/operation/repairs/{created.data['id']}/", {"status": RepairRecord.STATUS_COMPLETED}, format="json"
        )
        self.assertEqual(done.status_code, status.HTTP_200_OK, done.data)
        self.assertEqual(self._asset_status(), Asset.STATUS_AVAILABLE)
        self.assertIsNotNone(done.data["completed_date"])

    def test_closed_repair_returns_assigned_asset_to_assigned(self):
        employee = Employee.objects.create(name="Kiran Rao", department=self.department, location=self.location)
        Asset.objects.filter(pk=self.asset.pk).update(assigned_to=employee, status=Asset.STATUS_ASSIGNED)
        created = self._repair()
        self.client.patch(
            f"/api/operation/repairs/{created.data['id']}/", {"status": RepairRecord.STATUS_CANCELLED}, format="json"
        )
        self.assertEqual(self._asset_status(), Asset.STATUS_ASSIGNED)

    def test_maintenance_scheduled_and_cancelled(self):
        created = self._maintenance()
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(self._asset_status(), Asset.STATUS_MAINTENANCE)
        self.client.patch(
            f"/api/operation/maintenance/{created.data['id']}/",
            {"status": MaintenanceRecord.STATUS_CANCELLED}, format="json",
        )
        self.assertEqual(self._asset_status(), Asset.STATUS_AVAILABLE)

    def test_closing_repair_with_open_maintenance_leaves_maintenance(self):
        self._maintenance()
        repair = self._repair()
        self.assertEqual(self._asset_status(), Asset.STATUS_IN_REPAIR)
        self.client.patch(
            f"/api/operation/repairs/{repair.data['id']}/", {"status": RepairRecord.STATUS_COMPLETED}, format="json"
        )
        self.assertEqual(self._asset_status(), Asset.STATUS_MAINTENANCE)

    def test_deleting_open_repair_releases_asset(self):
        repair = self._repair()
        self.client.delete(f"/api/operation/repairs/{repair.data['id']}/")
        self.assertEqual(self._asset_status(), Asset.STATUS_AVAILABLE)

    def test_failed_sync_rolls_back_record(self):
        from unittest import mock

        with mock.patch("operation.services.sync_asset_service_status", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self._repair()
        self.assertFalse(RepairRecord.objects.exists())
        self.assertEqual(self._asset_status(), Asset.STATUS_AVAILABLE)

    def test_warranty_repair_exempt_from_required_cost(self):
        from system_settings.models import SystemSettings

        s = SystemSettings.load()
        s.require_repair_cost = True
        s.save()
        self.assertEqual(self._repair(cost="0", under_warranty=True).status_code, status.HTTP_201_CREATED)
        self.assertEqual(self._repair(cost="0", under_warranty=False).status_code, status.HTTP_400_BAD_REQUEST)


class AssetServiceStatusRollbackTests(OperationAPITestCase):
    """If the asset-status sync fails, the record write rolls back too."""

    _repair = AssetServiceStatusSyncTests._repair
    _maintenance = AssetServiceStatusSyncTests._maintenance
    _asset_status = AssetServiceStatusSyncTests._asset_status

    def _failing_sync(self):
        from unittest import mock

        return mock.patch("operation.services.sync_asset_service_status", side_effect=RuntimeError("boom"))

    def test_maintenance_create_rolls_back(self):
        with self._failing_sync(), self.assertRaises(RuntimeError):
            self._maintenance()
        self.assertFalse(MaintenanceRecord.objects.exists())
        self.assertEqual(self._asset_status(), Asset.STATUS_AVAILABLE)

    def test_repair_update_rolls_back(self):
        repair_id = self._repair().data["id"]
        with self._failing_sync(), self.assertRaises(RuntimeError):
            self.client.patch(
                f"/api/operation/repairs/{repair_id}/", {"status": RepairRecord.STATUS_COMPLETED}, format="json"
            )
        record = RepairRecord.objects.get(pk=repair_id)
        self.assertEqual(record.status, RepairRecord.STATUS_REPORTED)
        self.assertIsNone(record.completed_date)
        self.assertEqual(self._asset_status(), Asset.STATUS_IN_REPAIR)

    def test_maintenance_update_rolls_back(self):
        record_id = self._maintenance().data["id"]
        with self._failing_sync(), self.assertRaises(RuntimeError):
            self.client.patch(
                f"/api/operation/maintenance/{record_id}/",
                {"status": MaintenanceRecord.STATUS_COMPLETED}, format="json",
            )
        self.assertEqual(MaintenanceRecord.objects.get(pk=record_id).status, MaintenanceRecord.STATUS_SCHEDULED)
        self.assertEqual(self._asset_status(), Asset.STATUS_MAINTENANCE)

    def test_repair_delete_rolls_back(self):
        repair_id = self._repair().data["id"]
        with self._failing_sync(), self.assertRaises(RuntimeError):
            self.client.delete(f"/api/operation/repairs/{repair_id}/")
        self.assertTrue(RepairRecord.objects.filter(pk=repair_id).exists())
        self.assertEqual(self._asset_status(), Asset.STATUS_IN_REPAIR)

    def test_date_only_values_round_trip_unchanged(self):
        created = self._repair(reported_date="2026-09-24", expected_return_date="2026-09-24")
        self.assertEqual(created.data["reported_date"], "2026-09-24")
        self.assertEqual(created.data["expected_return_date"], "2026-09-24")
        done = self.client.patch(
            f"/api/operation/repairs/{created.data['id']}/",
            {"status": RepairRecord.STATUS_COMPLETED, "completed_date": "2026-09-24"}, format="json",
        )
        self.assertEqual(done.data["completed_date"], "2026-09-24")
        self.assertEqual(str(RepairRecord.objects.get(pk=created.data["id"]).completed_date), "2026-09-24")
