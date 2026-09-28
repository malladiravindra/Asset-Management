from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from assets.models import Department, Employee, Location
from accounts.testing import grant_role

from .models import Vendor


class EmployeeCRUDTests(APITestCase):
    """Organization > Employees — /api/organization/employees/."""

    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        # Names deliberately distinct from assets/migrations/0004's seed data
        # (always present post-migration, including in the test DB) so these
        # fixtures never collide with a pre-existing row under Department/
        # Location's unique constraint.
        self.department = Department.objects.create(name="QA Engineering")
        self.location = Location.objects.create(name="QA HQ")

    def _payload(self, **overrides):
        payload = {
            "name": "Anjali Singh",
            "email": "anjali@example.com",
            "phone": "9876543210",
            "location": self.location.id,
            "department": self.department.id,
        }
        payload.update(overrides)
        return payload

    def test_create_generates_employee_id(self):
        response = self.client.post("/api/organization/employees/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["employee_id"].startswith("EMP-"))
        self.assertEqual(response.data["status"], "active")
        self.assertEqual(response.data["department_name"], "QA Engineering")

    def test_rejects_duplicate_email(self):
        self.client.post("/api/organization/employees/", self._payload(), format="json")
        response = self.client.post(
            "/api/organization/employees/", self._payload(name="Someone Else"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_rejects_duplicate_name_case_insensitive(self):
        self.client.post("/api/organization/employees/", self._payload(), format="json")
        response = self.client.post(
            "/api/organization/employees/",
            self._payload(name="anjali singh", email="other@example.com"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_requires_location(self):
        # EmployeeSerializer.location is `required=True` but keeps the model
        # field's own `allow_null=True` (not overridden) — so an explicit
        # null is accepted (SET_NULL is valid at the DB level), but the key
        # must be present at all. Omitting it entirely is what "required"
        # actually rejects.
        payload = self._payload()
        del payload["location"]
        response = self.client.post("/api/organization/employees/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("location", response.data)

    def test_retrieve_update_delete(self):
        created = self.client.post("/api/organization/employees/", self._payload(), format="json").data
        employee_id_value = created["id"]

        retrieved = self.client.get(f"/api/organization/employees/{employee_id_value}/")
        self.assertEqual(retrieved.status_code, status.HTTP_200_OK)

        updated = self.client.patch(
            f"/api/organization/employees/{employee_id_value}/", {"designation": "Senior Engineer"}, format="json"
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["designation"], "Senior Engineer")

        deleted = self.client.delete(f"/api/organization/employees/{employee_id_value}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Employee.objects.filter(pk=employee_id_value).exists())

    def test_email_is_normalized_to_lowercase_and_trimmed(self):
        response = self.client.post(
            "/api/organization/employees/",
            self._payload(email="  Anjali.Singh@Example.COM  "),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["email"], "anjali.singh@example.com")

    def test_rejects_invalid_email_format(self):
        response = self.client.post(
            "/api/organization/employees/", self._payload(email="not-an-email"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_phone_normalizes_plus91_and_spaces_to_bare_digits(self):
        response = self.client.post(
            "/api/organization/employees/", self._payload(phone="+91 98765 43210"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["phone"], "9876543210")

    def test_rejects_phone_with_wrong_digit_count(self):
        response = self.client.post(
            "/api/organization/employees/", self._payload(phone="98765"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

    def test_rejects_alphabetic_phone(self):
        response = self.client.post(
            "/api/organization/employees/", self._payload(phone="98ABCDE210"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

    def test_requires_phone(self):
        payload = self._payload()
        del payload["phone"]
        response = self.client.post("/api/organization/employees/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)


class DepartmentCRUDTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)

    def test_create_list_update_delete(self):
        # "QA Finance Team" — distinct from assets/migrations/0004's seeded
        # "Finance" so this create can't collide with a pre-existing row.
        created = self.client.post(
            "/api/organization/departments/", {"name": "QA Finance Team"}, format="json"
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        dept_id = created.data["id"]
        self.assertEqual(created.data["employee_count"], 0)

        # DepartmentListAPIView returns every department (seeded + this one)
        # as a bare, unpaginated array — assert the new row is present
        # rather than asserting an exact count, since the seed migration
        # already populates several departments in every fresh database.
        listed = self.client.get("/api/organization/departments/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(dept_id, [d["id"] for d in listed.data])

        updated = self.client.patch(
            f"/api/organization/departments/{dept_id}/", {"color_key": "emerald"}, format="json"
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)

        deleted = self.client.delete(f"/api/organization/departments/{dept_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Department.objects.filter(pk=dept_id).exists())

    def test_rejects_duplicate_name(self):
        Department.objects.create(name="QA Finance Team")
        response = self.client.post(
            "/api/organization/departments/", {"name": "QA Finance Team"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LocationCRUDTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)

    def test_create_list_update_delete(self):
        # "QA Mumbai Branch" — distinct from assets/migrations/0004's seeded
        # "Mumbai Branch" so this create can't collide with a pre-existing row.
        created = self.client.post(
            "/api/organization/locations/",
            {"name": "QA Mumbai Branch", "type": "branch_office", "address": "Andheri East"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        loc_id = created.data["id"]

        # `results` holds every location (seeded + this one) — assert the
        # new row is present rather than asserting an exact count, since
        # the seed migration already populates several locations.
        listed = self.client.get("/api/organization/locations/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(loc_id, [l["id"] for l in listed.data["results"]])
        self.assertIn("summary", listed.data)

        updated = self.client.patch(
            f"/api/organization/locations/{loc_id}/", {"address": "BKC"}, format="json"
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)

        deleted = self.client.delete(f"/api/organization/locations/{loc_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Location.objects.filter(pk=loc_id).exists())

    def test_rejects_duplicate_name_case_insensitive(self):
        Location.objects.create(name="QA Mumbai Branch")
        response = self.client.post(
            "/api/organization/locations/", {"name": "qa mumbai branch", "type": "branch_office"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class VendorCRUDTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)

    def test_create_list_update_delete(self):
        created = self.client.post(
            "/api/organization/vendors/",
            {"name": "Dell Technologies", "email": "sales@dell.example", "vendor_type": "distributor"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        vendor_id = created.data["id"]
        self.assertEqual(created.data["status"], "Active")

        listed = self.client.get("/api/organization/vendors/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data["results"]), 1)

        updated = self.client.patch(
            f"/api/organization/vendors/{vendor_id}/", {"status": "Inactive"}, format="json"
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["status"], "Inactive")

        deleted = self.client.delete(f"/api/organization/vendors/{vendor_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Vendor.objects.filter(pk=vendor_id).exists())

    def test_rejects_invalid_email(self):
        response = self.client.post(
            "/api/organization/vendors/",
            {"name": "Bad Vendor", "email": "not-an-email", "vendor_type": "distributor"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_rejects_duplicate_name(self):
        Vendor.objects.create(name="Dell Technologies", email="a@dell.example", vendor_type=Vendor.TYPE_DISTRIBUTOR)
        response = self.client.post(
            "/api/organization/vendors/",
            {"name": "Dell Technologies", "email": "b@dell.example", "vendor_type": "distributor"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_email_is_normalized_to_lowercase_and_trimmed(self):
        response = self.client.post(
            "/api/organization/vendors/",
            {"name": "Redington", "email": "  Sales@Redington.CO.IN  ", "vendor_type": "distributor"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["email"], "sales@redington.co.in")

    def test_phone_is_optional(self):
        response = self.client.post(
            "/api/organization/vendors/",
            {"name": "No Phone Vendor", "email": "nophone@example.com", "vendor_type": "retailer"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["phone"], "")

    def test_phone_normalizes_when_provided(self):
        response = self.client.post(
            "/api/organization/vendors/",
            {
                "name": "Phone Vendor",
                "email": "phone@example.com",
                "vendor_type": "retailer",
                "phone": "+91 90000 11111",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["phone"], "9000011111")

    def test_rejects_invalid_phone_when_provided(self):
        response = self.client.post(
            "/api/organization/vendors/",
            {
                "name": "Bad Phone Vendor",
                "email": "badphone@example.com",
                "vendor_type": "retailer",
                "phone": "not-a-phone",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

    def test_extended_business_fields_persist(self):
        """Business/address/procurement/notes fields used to be collected
        by the Add/Edit Vendor form but silently discarded (no matching
        column) — confirms they now actually round-trip through the API."""
        payload = {
            "name": "Redington India",
            "email": "sales@redington.example",
            "vendor_type": "distributor",
            "company_name": "Redington (India) Ltd.",
            "contact_person": "Asha Rao",
            "gst_number": "29ABCDE1234F1Z5",
            "address": "123 MG Road",
            "city": "Bengaluru",
            "state": "Karnataka",
            "country": "India",
            "postal_code": "560001",
            "payment_terms": "Net 30",
            "currency": "INR",
            "notes": "Preferred distributor for laptops.",
        }
        created = self.client.post("/api/organization/vendors/", payload, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        for field, value in payload.items():
            self.assertEqual(created.data[field], value, field)

        # Persists across a fresh GET, not just the create response.
        fetched = self.client.get(f"/api/organization/vendors/{created.data['id']}/")
        self.assertEqual(fetched.data["company_name"], "Redington (India) Ltd.")
        self.assertEqual(fetched.data["gst_number"], "29ABCDE1234F1Z5")

    def test_extended_business_fields_are_optional(self):
        response = self.client.post(
            "/api/organization/vendors/",
            {"name": "Minimal Vendor", "email": "minimal@example.com", "vendor_type": "retailer"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["company_name"], "")
        self.assertEqual(response.data["currency"], "INR")


class VendorCodeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)

    def _create(self, name, email, **extra):
        return self.client.post(
            "/api/organization/vendors/",
            {"name": name, "email": email, "vendor_type": "distributor", **extra},
            format="json",
        )

    def test_vendor_code_is_server_generated_and_sequential(self):
        first = self._create("Vendor One", "one@example.com", vendor_code="HACKED-1")
        second = self._create("Vendor Two", "two@example.com")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(first.data["vendor_code"], "VEN-001")
        self.assertEqual(second.data["vendor_code"], "VEN-002")

    def test_vendor_code_cannot_be_changed(self):
        created = self._create("Vendor One", "one@example.com")
        updated = self.client.patch(
            f"/api/organization/vendors/{created.data['id']}/", {"vendor_code": "X"}, format="json"
        )
        self.assertEqual(updated.data["vendor_code"], "VEN-001")


class EmployeeClearFieldsTests(APITestCase):
    setUp = EmployeeCRUDTests.setUp
    _payload = EmployeeCRUDTests._payload

    def test_designation_and_department_can_be_cleared(self):
        created = self.client.post(
            "/api/organization/employees/", self._payload(designation="Engineer"), format="json"
        ).data
        response = self.client.patch(
            f"/api/organization/employees/{created['id']}/",
            {"designation": "", "department": None},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["designation"], "")
        self.assertIsNone(response.data["department"])


class VendorCodeNonApiTests(APITestCase):
    """Vendors created outside the API (admin, seed_vendors, ORM) also get
    a unique server-generated code."""

    def test_orm_created_vendors_get_unique_codes(self):
        first = Vendor.objects.create(name="ORM One", email="orm1@example.com", vendor_type="distributor")
        second = Vendor.objects.create(
            name="ORM Two", email="orm2@example.com", vendor_type="distributor", vendor_code=""
        )
        self.assertEqual(first.vendor_code, "VEN-001")
        self.assertEqual(second.vendor_code, "VEN-002")

    def test_existing_code_is_kept_on_save(self):
        vendor = Vendor.objects.create(name="ORM One", email="orm1@example.com", vendor_type="distributor")
        vendor.name = "Renamed"
        vendor.save()
        vendor.refresh_from_db()
        self.assertEqual(vendor.vendor_code, "VEN-001")
