import datetime
from io import StringIO

from django.contrib.auth.models import User
from django.core.management import call_command
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.test import APITestCase

from accounts import roles
from accounts.testing import grant_role
from assets.models import Asset, Department, Employee, Location
from catalog.models import Category
from operation.models import MaintenanceRecord, RepairRecord, SoftwareLicense
from operations import services as operations_services
from operations.models import Assignment, PurchaseOrder
from organization.models import Vendor
from system_settings.models import SystemSettings

from . import services
from .models import Notification

LIST_URL = "/api/notifications/"
TODAY = datetime.date.today()


def set_settings(**values):
    s = SystemSettings.load()
    for field, value in values.items():
        setattr(s, field, value)
    s.save()


class NotificationTestCase(APITestCase):
    def setUp(self):
        self.actor = grant_role(User.objects.create_user(username="actor", password="pw12345!"))
        self.colleague = grant_role(User.objects.create_user(username="colleague", password="pw12345!"), roles.ROLE_STANDARD)
        self.viewer = grant_role(User.objects.create_user(username="viewer", password="pw12345!"), roles.ROLE_VIEWER)
        self.category = Category.objects.create(name="Notif Laptops", code="NL")
        self.department = Department.objects.create(name="Notif Dept")
        self.location = Location.objects.create(name="Notif Site")
        self.employee_account = User.objects.create_user(username="holder", password="pw12345!")
        self.employee = Employee.objects.create(
            name="Nina Holder", email="nina@example.com", phone="9000000010",
            department=self.department, location=self.location, user=self.employee_account,
        )
        self.asset = Asset.objects.create(
            asset_code="AF-NL-0001", name="ThinkPad T14", category=self.category, serial_number="NL00000001",
            department=self.department, location=self.location, cost="50000.00",
        )

    def make(self, recipient, key, **kwargs):
        return services.create_notification(
            recipients=[recipient], type=Notification.TYPE_WARRANTY_EXPIRING, title=kwargs.pop("title", key),
            dedupe_key=key, **kwargs,
        )


class NotificationServiceTests(NotificationTestCase):
    def test_same_event_creates_one_row_per_recipient(self):
        self.assertEqual(len(self.make(self.actor, "evt:1")), 1)
        self.assertEqual(self.make(self.actor, "evt:1"), [])
        self.assertEqual(Notification.objects.filter(recipient=self.actor, dedupe_key="evt:1").count(), 1)
        self.assertEqual(len(self.make(self.colleague, "evt:1")), 1)

    def test_database_enforces_uniqueness(self):
        self.make(self.actor, "evt:db")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Notification.objects.create(recipient=self.actor, type="warranty_expiring", title="dup", dedupe_key="evt:db")

    def test_inactive_and_excluded_recipients_are_skipped(self):
        self.colleague.is_active = False
        self.colleague.save()
        rows = services.create_notification(
            recipients=[self.actor, self.colleague, None, self.viewer], type=Notification.TYPE_WARRANTY_EXPIRING,
            title="t", dedupe_key="evt:skip", exclude=self.actor,
        )
        self.assertEqual([r.recipient_id for r in rows], [self.viewer.pk])

    def test_settings_master_switch_and_module_toggle(self):
        set_settings(inapp_notifications_enabled=False)
        self.assertEqual(self.make(self.actor, "evt:off"), [])
        set_settings(inapp_notifications_enabled=True, inapp_notify_repair=False)
        rows = services.create_notification(
            recipients=[self.actor], type=Notification.TYPE_REPAIR_OVERDUE, title="t", dedupe_key="evt:repair"
        )
        self.assertEqual(rows, [])
        self.assertEqual(len(self.make(self.actor, "evt:warranty-still-on")), 1)

    def test_recipients_are_users_who_can_act(self):
        recipients = set(services.users_with_permission("operations.change_assignment"))
        self.assertIn(self.actor, recipients)
        self.assertIn(self.colleague, recipients)
        self.assertNotIn(self.viewer, recipients)


class NotificationAPITests(NotificationTestCase):
    def test_requires_authentication(self):
        self.assertEqual(self.client.get(LIST_URL).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.post(f"{LIST_URL}read-all/").status_code, status.HTTP_401_UNAUTHORIZED)

    def test_users_only_see_their_own(self):
        mine = self.make(self.actor, "evt:mine")[0]
        self.make(self.colleague, "evt:theirs")
        self.client.force_authenticate(user=self.actor)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([n["id"] for n in response.data["results"]], [Notification.objects.get(dedupe_key="evt:mine").pk])
        self.assertEqual(response.data["unread_count"], 1)
        self.assertNotIn("recipient", response.data["results"][0])
        self.assertNotIn("dedupe_key", response.data["results"][0])
        del mine

    def test_newest_first_pagination_and_unread_count(self):
        for i in range(25):
            self.make(self.actor, f"evt:page:{i}")
        self.client.force_authenticate(user=self.actor)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.data["count"], 25)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertEqual(response.data["unread_count"], 25)
        self.assertEqual(response.data["results"][0]["title"], "evt:page:24")
        page2 = self.client.get(f"{LIST_URL}?page=2")
        self.assertEqual(len(page2.data["results"]), 5)
        self.assertEqual(page2.data["unread_count"], 25)

    def test_mark_one_read(self):
        self.make(self.actor, "evt:read")
        notification = Notification.objects.get(dedupe_key="evt:read")
        self.client.force_authenticate(user=self.actor)
        response = self.client.patch(f"{LIST_URL}{notification.pk}/read/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)
        self.assertIsNotNone(notification.read_at)
        self.assertEqual(self.client.get(LIST_URL).data["unread_count"], 0)
        self.assertEqual(self.client.get(f"{LIST_URL}?is_read=false").data["count"], 0)

    def test_cannot_mark_another_users_notification(self):
        self.make(self.colleague, "evt:private")
        theirs = Notification.objects.get(dedupe_key="evt:private")
        self.client.force_authenticate(user=self.actor)
        self.assertEqual(self.client.patch(f"{LIST_URL}{theirs.pk}/read/").status_code, status.HTTP_404_NOT_FOUND)
        theirs.refresh_from_db()
        self.assertFalse(theirs.is_read)

    def test_read_all_only_affects_caller(self):
        self.make(self.actor, "evt:a1")
        self.make(self.actor, "evt:a2")
        self.make(self.colleague, "evt:c1")
        self.client.force_authenticate(user=self.actor)
        response = self.client.post(f"{LIST_URL}read-all/")
        self.assertEqual(response.data["updated"], 2)
        self.assertFalse(Notification.objects.filter(recipient=self.actor, is_read=False).exists())
        self.assertTrue(Notification.objects.get(dedupe_key="evt:c1").is_read is False)


class EventNotificationTests(NotificationTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.actor)

    def keys(self, user):
        return set(Notification.objects.filter(recipient=user).values_list("type", flat=True))

    def test_assignment_notifies_managers_and_employee_not_actor(self):
        response = self.client.post(
            "/api/operations/assignments/",
            {"asset": self.asset.id, "person": self.employee.id, "assigned_date": TODAY.isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIn(Notification.TYPE_ASSIGNMENT_CREATED, self.keys(self.colleague))
        self.assertIn(Notification.TYPE_ASSIGNMENT_CREATED, self.keys(self.employee_account))
        self.assertNotIn(Notification.TYPE_ASSIGNMENT_CREATED, self.keys(self.actor))
        self.assertNotIn(Notification.TYPE_ASSIGNMENT_CREATED, self.keys(self.viewer))

    def test_return_notifies(self):
        assignment = operations_services.create_assignment(asset=self.asset, person=self.employee, assigned_date=TODAY)
        response = self.client.post(
            "/api/operations/returns/",
            {"assignment": assignment.id, "return_date": TODAY.isoformat(), "condition": "Good"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(
            Notification.objects.filter(recipient=self.colleague, type=Notification.TYPE_RETURN_PROCESSED).count(), 1
        )

    def test_repair_created_and_status_changes_without_duplicates(self):
        payload = {
            "asset": self.asset.id, "issue_type": RepairRecord.ISSUE_SCREEN_DAMAGE, "issue": "Cracked",
            "vendor": "Dell", "priority": RepairRecord.PRIORITY_HIGH, "cost": "100.00",
            "reported_date": TODAY.isoformat(), "expected_return_date": (TODAY + datetime.timedelta(days=5)).isoformat(),
            "status": RepairRecord.STATUS_REPORTED,
        }
        created = self.client.post("/api/operation/repairs/", payload, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        url = f"/api/operation/repairs/{created.data['id']}/"
        self.client.patch(url, {"status": RepairRecord.STATUS_IN_PROGRESS}, format="json")
        self.client.patch(url, {"notes": "no status change"}, format="json")
        rows = Notification.objects.filter(recipient=self.colleague, type=Notification.TYPE_REPAIR_STATUS_CHANGED)
        self.assertEqual(rows.count(), 2)
        self.assertEqual(rows.filter(priority=Notification.PRIORITY_HIGH).count(), 2)

    def test_maintenance_status_change(self):
        record = MaintenanceRecord.objects.create(
            asset=self.asset, type=MaintenanceRecord.TYPE_PREVENTIVE, technician="Tech",
            scheduled_date=TODAY + datetime.timedelta(days=3),
        )
        response = self.client.patch(
            f"/api/operation/maintenance/{record.pk}/",
            {"status": MaintenanceRecord.STATUS_COMPLETED, "completed_date": TODAY.isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(Notification.objects.filter(
            recipient=self.colleague, type=Notification.TYPE_MAINTENANCE_STATUS_CHANGED,
            dedupe_key=f"maintenance_status:{record.pk}:Completed",
        ).exists())

    def test_purchase_order_status_change(self):
        vendor = Vendor.objects.create(name="Notif Vendor", email="vendor@notif.example", vendor_type=Vendor.TYPE_DISTRIBUTOR)
        order = PurchaseOrder.objects.create(
            vendor=vendor, department=self.department, requested_by=self.employee,
            expected_date=TODAY + datetime.timedelta(days=10), po_number="PO-NOTIF-1",
        )
        response = self.client.patch(
            f"/api/operations/purchase-orders/{order.pk}/", {"status": PurchaseOrder.STATUS_APPROVED}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn(Notification.TYPE_PURCHASE_ORDER_STATUS_CHANGED, self.keys(self.colleague))
        self.assertIn(Notification.TYPE_PURCHASE_ORDER_STATUS_CHANGED, self.keys(self.employee_account))

    def test_rolled_back_operation_leaves_no_notification(self):
        with self.assertRaises(RuntimeError), transaction.atomic():
            operations_services.create_assignment(asset=self.asset, person=self.employee, assigned_date=TODAY)
            raise RuntimeError("simulated failure after the assignment")
        self.assertFalse(Assignment.objects.exists())
        self.assertFalse(Notification.objects.exists())

    def test_disabled_module_setting_suppresses_event(self):
        set_settings(inapp_notify_assignment=False)
        operations_services.create_assignment(asset=self.asset, person=self.employee, assigned_date=TODAY)
        self.assertFalse(Notification.objects.filter(type=Notification.TYPE_ASSIGNMENT_CREATED).exists())


class ScheduledNotificationTests(NotificationTestCase):
    def setUp(self):
        super().setUp()
        self.asset.warranty_end_date = TODAY + datetime.timedelta(days=10)
        self.asset.save()
        Asset.objects.create(
            asset_code="AF-NL-0002", name="Old Laptop", category=self.category, serial_number="NL00000002",
            department=self.department, location=self.location, cost="1000.00",
            warranty_end_date=TODAY - datetime.timedelta(days=1),
        )
        MaintenanceRecord.objects.create(
            asset=self.asset, type=MaintenanceRecord.TYPE_INSPECTION, technician="Tech",
            scheduled_date=TODAY - datetime.timedelta(days=2),
        )
        RepairRecord.objects.create(
            asset=self.asset, repair_id="REP-N-1", issue_type=RepairRecord.ISSUE_SCREEN_DAMAGE, issue="x",
            vendor="v", reported_date=TODAY - datetime.timedelta(days=9),
            expected_return_date=TODAY - datetime.timedelta(days=1),
        )
        SoftwareLicense.objects.create(
            license_id="LIC-N-1", name="Office", license_type=SoftwareLicense.TYPE_ANNUAL,
            expiry_date=TODAY + datetime.timedelta(days=5),
        )

    def run_command(self):
        out = StringIO()
        call_command("generate_notifications", stdout=out)
        return out.getvalue()

    def test_command_creates_each_type_once_and_is_idempotent(self):
        first = self.run_command()
        self.assertIn("Created", first)
        types = set(Notification.objects.filter(recipient=self.actor).values_list("type", flat=True))
        self.assertEqual(types, {
            Notification.TYPE_WARRANTY_EXPIRING, Notification.TYPE_WARRANTY_EXPIRED,
            Notification.TYPE_MAINTENANCE_OVERDUE, Notification.TYPE_REPAIR_OVERDUE,
            Notification.TYPE_LICENSE_EXPIRING,
        })
        total = Notification.objects.count()
        second = self.run_command()
        self.assertIn("Created 0 notification(s).", second)
        self.assertEqual(Notification.objects.count(), total)
        # Viewers can't act on these records, so they aren't notified.
        self.assertFalse(Notification.objects.filter(recipient=self.viewer).exists())

    def test_new_expiry_date_is_a_new_event(self):
        self.run_command()
        self.asset.warranty_end_date = TODAY + datetime.timedelta(days=20)
        self.asset.save()
        self.run_command()
        self.assertEqual(
            Notification.objects.filter(recipient=self.actor, type=Notification.TYPE_WARRANTY_EXPIRING,
                                        target_id=self.asset.pk).count(),
            2,
        )

    def test_respects_disabled_settings(self):
        set_settings(inapp_notifications_enabled=False)
        self.assertIn("Created 0 notification(s).", self.run_command())
        self.assertFalse(Notification.objects.exists())
