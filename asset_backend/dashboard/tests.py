from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from aduitlog.models import AuditLog
from aduitlog.services import create_audit_log
from assets.models import Asset, Department, Location
from catalog.models import Category
from operation.models import MaintenanceRecord, RepairRecord
from accounts.testing import grant_role


def make_asset(category, department, location, **overrides):
    defaults = {
        "asset_code": f"AF-TEST-{Asset.objects.count() + 1:04d}",
        "name": "Test Asset",
        "category": category,
        "serial_number": f"SN-{Asset.objects.count() + 1:06d}",
        "department": department,
        "location": location,
        "cost": 1000,
        "status": Asset.STATUS_AVAILABLE,
        "warranty_status": Asset.WARRANTY_ACTIVE,
    }
    defaults.update(overrides)
    return Asset.objects.create(**defaults)


class DashboardAPITests(APITestCase):
    """assets/migrations/0004_seed_departments_locations.py seeds 6 fixed
    Department rows (Engineering, Finance, Operations, Sales, Marketing,
    Human Resources) and 7 fixed Location rows into every test database —
    reuse those seeded rows instead of creating new ones with the same
    name (Department.name/Location.name are both unique=True)."""

    SEEDED_DEPARTMENT_COUNT = 6

    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name="Laptops")
        self.department = Department.objects.get(name="Engineering")
        self.location = Location.objects.get(name="HQ - Floor 1")

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_database_returns_zeroed_summary(self):
        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_assets"], 0)
        self.assertEqual(response.data["available_count"], 0)
        self.assertEqual(response.data["assigned_count"], 0)
        self.assertEqual(response.data["under_service_count"], 0)
        self.assertEqual(response.data["warranty_alerts_count"], 0)
        self.assertEqual(response.data["warranty_alerts"], [])
        self.assertEqual(response.data["total_current_value"], 0)
        self.assertEqual(response.data["total_purchase_cost"], 0)
        # self.category ("Laptops") exists but has no assets yet.
        self.assertEqual(response.data["by_category"], [{"category_name": "Laptops", "asset_count": 0}])
        self.assertEqual(response.data["recent_activity"], [])
        # Departments/statuses are still zero-filled even with no assets.
        self.assertEqual(len(response.data["by_department"]), self.SEEDED_DEPARTMENT_COUNT)
        for row in response.data["by_department"]:
            self.assertEqual(row["asset_count"], 0)
        self.assertEqual(len(response.data["by_status"]), 5)
        for row in response.data["by_status"]:
            self.assertEqual(row["count"], 0)
            self.assertEqual(row["percentage"], 0)

    def test_status_counts_and_totals(self):
        make_asset(self.category, self.department, self.location, status=Asset.STATUS_AVAILABLE, cost=1000)
        make_asset(self.category, self.department, self.location, status=Asset.STATUS_ASSIGNED, cost=2000)
        make_asset(self.category, self.department, self.location, status=Asset.STATUS_ASSIGNED, cost=3000)

        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_assets"], 3)
        self.assertEqual(response.data["available_count"], 1)
        self.assertEqual(response.data["assigned_count"], 2)
        self.assertEqual(response.data["total_current_value"], 6000.0)
        self.assertEqual(response.data["total_purchase_cost"], 6000.0)

        by_status = {row["status"]: row for row in response.data["by_status"]}
        self.assertEqual(by_status["Available"]["count"], 1)
        self.assertEqual(by_status["Assigned"]["count"], 2)
        self.assertEqual(by_status["Assigned"]["percentage"], 67)
        self.assertEqual(by_status["In Repair"]["count"], 0)

    def test_department_breakdown_is_zero_filled_for_every_department(self):
        # "Finance" is one of the seeded departments — reused rather than
        # created, since Department.name is unique.
        make_asset(self.category, self.department, self.location)

        response = self.client.get("/api/dashboard/")
        by_dept = {row["department_name"]: row for row in response.data["by_department"]}
        self.assertEqual(len(by_dept), self.SEEDED_DEPARTMENT_COUNT)
        self.assertEqual(by_dept["Engineering"]["asset_count"], 1)
        self.assertEqual(by_dept["Engineering"]["percentage"], 100)
        self.assertEqual(by_dept["Finance"]["asset_count"], 0)
        self.assertEqual(by_dept["Finance"]["percentage"], 0)

    def test_category_breakdown(self):
        other_category = Category.objects.create(name="Mobiles")
        make_asset(self.category, self.department, self.location)
        make_asset(self.category, self.department, self.location)

        response = self.client.get("/api/dashboard/")
        by_cat = {row["category_name"]: row["asset_count"] for row in response.data["by_category"]}
        self.assertEqual(by_cat["Laptops"], 2)
        self.assertEqual(by_cat["Mobiles"], 0)

    def test_under_service_counts_only_open_maintenance_and_repair_jobs(self):
        asset = make_asset(self.category, self.department, self.location)
        MaintenanceRecord.objects.create(
            asset=asset, type=MaintenanceRecord.TYPE_PREVENTIVE, technician="Alex",
            scheduled_date="2026-01-01", status=MaintenanceRecord.STATUS_SCHEDULED,
        )
        MaintenanceRecord.objects.create(
            asset=asset, type=MaintenanceRecord.TYPE_PREVENTIVE, technician="Alex",
            scheduled_date="2026-01-01", status=MaintenanceRecord.STATUS_COMPLETED,
        )
        RepairRecord.objects.create(
            repair_id="REP-001", asset=asset, issue_type=RepairRecord.ISSUE_BATTERY,
            issue="Battery drains fast", vendor="Local Repair Shop",
            reported_date="2026-01-01", expected_return_date="2026-01-05",
            status=RepairRecord.STATUS_REPORTED,
        )
        RepairRecord.objects.create(
            repair_id="REP-002", asset=asset, issue_type=RepairRecord.ISSUE_BATTERY,
            issue="Battery drains fast", vendor="Local Repair Shop",
            reported_date="2026-01-01", expected_return_date="2026-01-05",
            status=RepairRecord.STATUS_CANCELLED,
        )

        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.data["under_service_count"], 2)

    def test_warranty_alerts_returns_real_expiring_assets_only(self):
        expiring = make_asset(
            self.category, self.department, self.location,
            name="Expiring Laptop", warranty_status=Asset.WARRANTY_EXPIRING,
        )
        make_asset(self.category, self.department, self.location, warranty_status=Asset.WARRANTY_ACTIVE)

        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.data["warranty_alerts_count"], 1)
        self.assertEqual(len(response.data["warranty_alerts"]), 1)
        alert = response.data["warranty_alerts"][0]
        self.assertEqual(alert["asset_code"], expiring.asset_code)
        self.assertEqual(alert["name"], "Expiring Laptop")
        self.assertEqual(alert["warranty_status"], "Expiring")
        # No warranty_end_date on file -> no invented days_left.
        self.assertIsNone(alert["warranty_end_date"])
        self.assertIsNone(alert["days_left"])
        self.assertNotIn("warrantyEndDate", alert)

    def test_warranty_alerts_use_real_end_date(self):
        import datetime
        today = datetime.date.today()
        soon = make_asset(
            self.category, self.department, self.location, name="Soon",
            warranty_end_date=today + datetime.timedelta(days=10),
        )
        # Stored status says Active but the end date is past -> Expired, not an alert.
        make_asset(
            self.category, self.department, self.location, name="Old",
            warranty_status=Asset.WARRANTY_ACTIVE,
            warranty_end_date=today - datetime.timedelta(days=1),
        )
        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.data["warranty_alerts_count"], 1)
        alert = response.data["warranty_alerts"][0]
        self.assertEqual(alert["asset_code"], soon.asset_code)
        self.assertEqual(alert["days_left"], 10)

    def test_recent_activity_is_five_most_recent_newest_first(self):
        for i in range(7):
            create_audit_log(action=AuditLog.ACTION_CREATE, title=f"Event {i}", actor=self.user)

        response = self.client.get("/api/dashboard/")
        activity = response.data["recent_activity"]
        self.assertEqual(len(activity), 5)
        self.assertEqual(activity[0]["title"], "Event 6")
        self.assertEqual(activity[-1]["title"], "Event 2")
        self.assertEqual(activity[0]["action"], "CREATE")
        self.assertIn("timestamp", activity[0])

    def test_attention_counts_for_sidebar_badges(self):
        import datetime

        from operation.models import Accessory, SoftwareLicense

        today = datetime.date.today()
        asset = make_asset(self.category, self.department, self.location, name="Serviced")
        MaintenanceRecord.objects.create(
            asset=asset, type=MaintenanceRecord.TYPE_PREVENTIVE, technician="T",
            scheduled_date=today - datetime.timedelta(days=1),
        )
        MaintenanceRecord.objects.create(
            asset=asset, type=MaintenanceRecord.TYPE_PREVENTIVE, technician="T",
            scheduled_date=today + datetime.timedelta(days=5),
        )
        SoftwareLicense.objects.create(
            license_id="LIC-D-1", name="Soon", license_type=SoftwareLicense.TYPE_ANNUAL,
            expiry_date=today + datetime.timedelta(days=3),
        )
        SoftwareLicense.objects.create(
            license_id="LIC-D-2", name="Forever", license_type=SoftwareLicense.TYPE_PERPETUAL,
        )
        Accessory.objects.create(sku="AC-1", name="Mouse", category="Mice", total_qty=5, assigned_qty=4, reorder_threshold=2)
        Accessory.objects.create(sku="AC-2", name="Cable", category="Cables", total_qty=50, assigned_qty=1, reorder_threshold=2)

        attention = self.client.get("/api/dashboard/").data["attention"]
        self.assertEqual(attention, {
            "overdue_maintenance_count": 1,
            "overdue_repair_count": 0,
            "licenses_attention_count": 1,
            "low_stock_accessories_count": 1,
        })
