"""
Tests for the Reports API.

Covers:
  - GET  /api/reports/          → 200, correct structure
  - GET  /api/reports/assets/   → 200, CSV-export rows (read-only; asset
    create/update/delete belong to /api/assets/ only)

All tests use a real (test) database — no mocks, no hardcoded values.
"""
import datetime
import json

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from assets.models import Asset, Department, Location
from catalog.models import Category
from accounts.testing import grant_role

User = get_user_model()


def _jwt_headers(user):
    """Return Authorization header dict for the given user."""
    token = RefreshToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {token.access_token}"}


class ReportsSummaryTests(APITestCase):
    """Tests for GET /api/reports/ — the main Reports page endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pass")
        grant_role(self.user)
        self.headers = _jwt_headers(self.user)

        self.category = Category.objects.create(name="Laptop", code="LT")
        self.department = Department.objects.create(name="IT")
        self.location = Location.objects.create(name="HQ")

    def _make_asset(self, **kwargs):
        defaults = {
            "asset_code": f"AF-LT-{Asset.objects.count():04d}",
            "name": "Test Laptop",
            "serial_number": f"SN{Asset.objects.count():06d}",
            "category": self.category,
            "department": self.department,
            "location": self.location,
            "status": Asset.STATUS_ASSIGNED,
            "condition": Asset.CONDITION_GOOD,
            "warranty_status": Asset.WARRANTY_ACTIVE,
            "cost": "50000.00",
            "current_value": "40000.00",
            "purchase_date": datetime.date.today(),
        }
        defaults.update(kwargs)
        return Asset.objects.create(**defaults)

    def test_summary_returns_200(self):
        url = "/api/reports/"
        response = self.client.get(url, **self.headers)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_summary_structure(self):
        self._make_asset()
        url = "/api/reports/"
        response = self.client.get(url, **self.headers)
        data = response.json()

        required_keys = [
            "totalAssets", "utilizationRate", "totalValue", "totalCost",
            "depreciationPct", "avgAgeLabel", "warrantyAttention",
            "statusBreakdown", "departmentBreakdown", "categoryBreakdown",
            "warrantyBreakdown", "conditionBreakdown",
            "monthlyAcquisitions", "totalAcquired",
        ]
        for key in required_keys:
            self.assertIn(key, data, f"Missing key: {key}")

    def test_total_assets_reflects_db(self):
        url = "/api/reports/"
        r1 = self.client.get(url, **self.headers).json()
        initial = r1["totalAssets"]

        self._make_asset()
        r2 = self.client.get(url, **self.headers).json()
        self.assertEqual(r2["totalAssets"], initial + 1)

    def test_unauthenticated_returns_401(self):
        response = self.client.get("/api/reports/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_monthly_acquisitions_has_12_buckets(self):
        response = self.client.get("/api/reports/", **self.headers)
        data = response.json()
        self.assertEqual(len(data["monthlyAcquisitions"]), 12)

    def test_acquisition_count_reflects_purchase_date(self):
        today = datetime.date.today()
        self._make_asset(purchase_date=today)
        response = self.client.get("/api/reports/", **self.headers)
        data = response.json()
        # The last bucket is the current month — its value should be >= 1.
        last_bucket = data["monthlyAcquisitions"][-1]
        self.assertGreaterEqual(last_bucket["value"], 1)
        self.assertGreaterEqual(data["totalAcquired"], 1)

    def test_status_breakdown_contains_all_statuses(self):
        self._make_asset(status=Asset.STATUS_ASSIGNED)
        self._make_asset(status=Asset.STATUS_AVAILABLE,
                         asset_code="AF-LT-9001", serial_number="SN999001")
        response = self.client.get("/api/reports/", **self.headers)
        labels = [s["label"] for s in response.json()["statusBreakdown"]]
        for expected in ["Assigned", "Available", "In Repair", "Reserved", "Maintenance"]:
            self.assertIn(expected, labels)

    def test_warranty_attention_counts_expiring_and_expired(self):
        self._make_asset(warranty_status=Asset.WARRANTY_EXPIRING)
        self._make_asset(warranty_status=Asset.WARRANTY_EXPIRED,
                         asset_code="AF-LT-9002", serial_number="SN999002")
        response = self.client.get("/api/reports/", **self.headers)
        self.assertGreaterEqual(response.json()["warrantyAttention"], 2)


class ReportsAssetExportTests(APITestCase):
    """GET /api/reports/assets/ — the read-only asset rows behind the
    Reports CSV export. Writes were removed: they duplicated /api/assets/
    without its serial-number validation or audit logging."""

    LIST_URL = "/api/reports/assets/"

    def setUp(self):
        self.user = User.objects.create_user(username="export_tester", password="pass")
        grant_role(self.user)
        self.headers = _jwt_headers(self.user)
        category = Category.objects.create(name="Tablet", code="TB")
        department = Department.objects.create(name="Reports Finance")
        location = Location.objects.create(name="Mumbai")
        self.asset = Asset.objects.create(
            asset_code="AF-TB-0001", name="Test Tablet", category=category, serial_number="AB123456",
            department=department, location=location, cost=25000,
        )

    def test_list_returns_contract_rows(self):
        response = self.client.get(self.LIST_URL, **self.headers)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.json()
        self.assertIsInstance(rows, list)
        self.assertEqual(rows[0]["tag"], "AF-TB-0001")
        for field in ["id", "tag", "name", "category", "department", "status", "condition", "location",
                      "cost", "currentValue", "purchaseDate", "warranty"]:
            self.assertIn(field, rows[0], f"Missing field: {field}")

    def test_writes_are_not_offered(self):
        payload = json.dumps({"name": "Nope"})
        for method in ("post", "put", "patch", "delete"):
            response = getattr(self.client, method)(self.LIST_URL, data=payload, content_type="application/json", **self.headers)
            self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED, method)
        detail = self.client.get(f"{self.LIST_URL}{self.asset.pk}/", **self.headers)
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Asset.objects.filter(pk=self.asset.pk).exists())

    def test_requires_view_permission(self):
        no_role = User.objects.create_user(username="export_no_role", password="pass")
        response = self.client.get(self.LIST_URL, **_jwt_headers(no_role))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
