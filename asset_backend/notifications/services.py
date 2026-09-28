"""The one place in-app notifications are created.

Business code calls the notify_* helpers below from inside its existing
transaction (operations/services.py, operation/views.py, operations/views.py),
so a rolled-back operation leaves no notification behind. Time-based
conditions (warranty/license expiry, overdue maintenance/repairs) have no
event moment; generate_scheduled_notifications() scans for them and is run
by `python manage.py generate_notifications`.

Rules applied to every notification:
  * Settings > Notifications: in-app master switch + the per-module toggle
    (SETTING_FOR_TYPE). Types without a module toggle follow the master
    switch only.
  * Recipients are active users who can act on the record — holders of the
    module's change_* permission (via their roles; superusers included) —
    plus, for assignment/return/service events, the login account linked
    to the employee concerned. The user who performed the action is never
    notified about their own action.
  * dedupe_key + the (recipient, dedupe_key) unique constraint: one event
    produces at most one row per user, however often it fires.
"""
import datetime

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.db import transaction
from django.db.models import Q

from system_settings.services import get_system_settings

from .models import Notification

N = Notification

SETTING_FOR_TYPE = {
    N.TYPE_ASSIGNMENT_CREATED: "inapp_notify_assignment",
    # Returns end an assignment; Settings has no separate in-app "returns"
    # toggle (email_notify_return is email-only), so they share this one.
    N.TYPE_RETURN_PROCESSED: "inapp_notify_assignment",
    N.TYPE_REPAIR_STATUS_CHANGED: "inapp_notify_repair",
    N.TYPE_REPAIR_OVERDUE: "inapp_notify_repair",
    N.TYPE_MAINTENANCE_STATUS_CHANGED: "inapp_notify_maintenance",
    N.TYPE_MAINTENANCE_OVERDUE: "inapp_notify_maintenance",
    N.TYPE_PURCHASE_ORDER_STATUS_CHANGED: "inapp_notify_purchase_order",
    # warranty_* / license_* have no module toggle: master switch only
    # (matches the previous feed, where warranty alerts couldn't be hidden).
}

LICENSE_EXPIRING_DAYS = 30  # same threshold as SoftwareLicense.status ("Expiring Soon")


def notifications_enabled(notification_type):
    s = get_system_settings()
    if not s.inapp_notifications_enabled:
        return False
    field = SETTING_FOR_TYPE.get(notification_type)
    return getattr(s, field) if field else True


def users_with_permission(label):
    """Active users holding `label` ("app_label.codename") through an active
    role, a direct grant, or superuser status."""
    User = get_user_model()
    app_label, codename = label.split(".", 1)
    permission = Permission.objects.filter(content_type__app_label=app_label, codename=codename).first()
    q = Q(is_superuser=True)
    if permission is not None:
        roles = Group.objects.filter(permissions=permission).exclude(role_profile__is_active=False)
        q |= Q(user_permissions=permission) | Q(groups__in=roles)
    return User.objects.filter(is_active=True).filter(q).distinct()


def _day(value):
    """'05 Mar 2026' for a date — or an ISO string, which is what a model
    instance holds when a caller passed one straight to create()."""
    if isinstance(value, str):
        value = datetime.date.fromisoformat(value[:10])
    return value.strftime("%d %b %Y")


def _linked_user(employee):
    user = getattr(employee, "user", None) if employee is not None else None
    return user if user is not None and user.is_active else None


def create_notification(*, recipients, type, title, dedupe_key, message="", priority=N.PRIORITY_NORMAL,
                        target_type="", target_id=None, action_url="", exclude=None):
    """Create one notification per eligible recipient and return the rows
    actually created. Skips everything when Settings disable this type,
    drops inactive/None recipients and `exclude` (the acting user), and
    never duplicates an event already delivered to a recipient."""
    if not notifications_enabled(type):
        return []
    recipient_ids = {u.pk for u in recipients if u is not None and u.is_active}
    if exclude is not None:
        recipient_ids.discard(exclude.pk)
    if not recipient_ids:
        return []
    already = set(
        Notification.objects.filter(dedupe_key=dedupe_key, recipient_id__in=recipient_ids)
        .values_list("recipient_id", flat=True)
    )
    rows = [
        Notification(
            recipient_id=pk, type=type, title=title[:200], message=message[:500], priority=priority,
            target_type=target_type, target_id=target_id, action_url=action_url, dedupe_key=dedupe_key,
        )
        for pk in sorted(recipient_ids - already)
    ]
    # ignore_conflicts: a concurrent writer that got there first is fine —
    # the unique constraint keeps exactly one row, and the surrounding
    # business transaction is not aborted.
    Notification.objects.bulk_create(rows, ignore_conflicts=True)
    return rows


# ------------------------------------------------------------ event-based


def notify_assignment_created(assignment, *, actor=None):
    asset, person = assignment.asset, assignment.person
    return create_notification(
        recipients=[*users_with_permission("operations.change_assignment"), _linked_user(person)],
        type=N.TYPE_ASSIGNMENT_CREATED,
        title=f"{asset.asset_code} assigned to {person.name}",
        message=f"{asset.name} was assigned on {_day(assignment.assigned_date)}.",
        target_type="assignment",
        target_id=assignment.pk,
        action_url="/dashboard/assignments",
        dedupe_key=f"assignment_created:{assignment.pk}",
        exclude=actor,
    )


def notify_return_processed(return_record, *, actor=None):
    assignment = return_record.assignment
    asset, person = assignment.asset, assignment.person
    condition = f" in {return_record.condition} condition" if return_record.condition else ""
    return create_notification(
        recipients=[*users_with_permission("operations.change_assignment"), _linked_user(person)],
        type=N.TYPE_RETURN_PROCESSED,
        title=f"{asset.asset_code} returned by {person.name}",
        message=f"{asset.name} was returned on {_day(return_record.return_date)}{condition}.",
        target_type="return",
        target_id=return_record.pk,
        action_url="/dashboard/returns",
        dedupe_key=f"return_processed:{return_record.pk}",
        exclude=actor,
    )


def notify_repair_status(repair, *, actor=None):
    """A repair was reported (created) or moved to a new status. One
    notification per repair per status."""
    asset = repair.asset
    return create_notification(
        recipients=[*users_with_permission("operation.change_repairrecord"), _linked_user(asset.assigned_to)],
        type=N.TYPE_REPAIR_STATUS_CHANGED,
        title=f"Repair {repair.repair_id} is {repair.status}",
        message=f"{asset.asset_code} {asset.name}: {repair.issue}",
        priority=N.PRIORITY_HIGH if repair.priority == "High" else N.PRIORITY_NORMAL,
        target_type="repair",
        target_id=repair.pk,
        action_url="/dashboard/repairs",
        dedupe_key=f"repair_status:{repair.pk}:{repair.status}",
        exclude=actor,
    )


def notify_maintenance_status(record, *, actor=None):
    """Maintenance was scheduled (created) or moved to a new status."""
    asset = record.asset
    return create_notification(
        recipients=[*users_with_permission("operation.change_maintenancerecord"), _linked_user(asset.assigned_to)],
        type=N.TYPE_MAINTENANCE_STATUS_CHANGED,
        title=f"{record.type} maintenance for {asset.asset_code} is {record.status}",
        message=f"{asset.name}, scheduled {_day(record.scheduled_date)}.",
        priority=N.PRIORITY_HIGH if record.priority == "High" else N.PRIORITY_NORMAL,
        target_type="maintenance",
        target_id=record.pk,
        action_url="/dashboard/maintenance",
        dedupe_key=f"maintenance_status:{record.pk}:{record.status}",
        exclude=actor,
    )


def notify_purchase_order_status(order, *, actor=None):
    return create_notification(
        recipients=[*users_with_permission("operations.change_purchaseorder"), _linked_user(order.requested_by)],
        type=N.TYPE_PURCHASE_ORDER_STATUS_CHANGED,
        title=f"Purchase order {order.po_number} is {order.status}",
        message=f"Vendor: {order.vendor.name}",
        target_type="purchase_order",
        target_id=order.pk,
        action_url="/dashboard/purchase-orders",
        dedupe_key=f"purchase_order_status:{order.pk}:{order.status}",
        exclude=actor,
    )


# ------------------------------------------------------------ time-based


def _date_key(value):
    return value.isoformat() if value else "none"


@transaction.atomic
def generate_scheduled_notifications(today=None):
    """Create notifications for every currently due/overdue condition.
    Idempotent: keys include the date the condition depends on, so a
    re-run creates nothing new, while e.g. a renewed-then-lapsed warranty
    (new end date) is a new event and notifies again. Returns
    {type: created_count}."""
    from assets.models import Asset
    from operation.models import MaintenanceRecord, RepairRecord, SoftwareLicense
    from operation.services import OPEN_MAINTENANCE_STATUSES, OPEN_REPAIR_STATUSES

    today = today or datetime.date.today()
    created = {}

    def emit(recipients, **kwargs):
        rows = create_notification(recipients=recipients, **kwargs)
        created[kwargs["type"]] = created.get(kwargs["type"], 0) + len(rows)

    asset_managers = list(users_with_permission("assets.change_asset"))
    for status, type_, priority, verb in (
        (Asset.WARRANTY_EXPIRING, N.TYPE_WARRANTY_EXPIRING, N.PRIORITY_NORMAL, "expires"),
        (Asset.WARRANTY_EXPIRED, N.TYPE_WARRANTY_EXPIRED, N.PRIORITY_HIGH, "expired"),
    ):
        for asset in Asset.objects.filter(Asset.warranty_q(status, today=today)):
            when = f" on {_day(asset.warranty_end_date)}" if asset.warranty_end_date else ""
            emit(
                asset_managers,
                type=type_,
                title=f"Warranty {verb} for {asset.asset_code}",
                message=f"{asset.name} warranty {verb}{when}.",
                priority=priority,
                target_type="asset",
                target_id=asset.pk,
                action_url="/dashboard/assets",
                dedupe_key=f"{type_}:{asset.pk}:{_date_key(asset.warranty_end_date)}",
            )

    maintenance_managers = list(users_with_permission("operation.change_maintenancerecord"))
    overdue_maintenance = MaintenanceRecord.objects.select_related("asset").filter(
        status__in=OPEN_MAINTENANCE_STATUSES, scheduled_date__lt=today
    )
    for record in overdue_maintenance:
        emit(
            maintenance_managers,
            type=N.TYPE_MAINTENANCE_OVERDUE,
            title=f"Maintenance overdue for {record.asset.asset_code}",
            message=f"{record.type} maintenance was scheduled for {_day(record.scheduled_date)}.",
            priority=N.PRIORITY_HIGH,
            target_type="maintenance",
            target_id=record.pk,
            action_url="/dashboard/maintenance",
            dedupe_key=f"maintenance_overdue:{record.pk}:{_date_key(record.scheduled_date)}",
        )

    repair_managers = list(users_with_permission("operation.change_repairrecord"))
    overdue_repairs = RepairRecord.objects.select_related("asset").filter(
        status__in=OPEN_REPAIR_STATUSES, expected_return_date__lt=today
    )
    for repair in overdue_repairs:
        emit(
            repair_managers,
            type=N.TYPE_REPAIR_OVERDUE,
            title=f"Repair {repair.repair_id} is overdue",
            message=f"{repair.asset.asset_code} was expected back on {_day(repair.expected_return_date)}.",
            priority=N.PRIORITY_HIGH,
            target_type="repair",
            target_id=repair.pk,
            action_url="/dashboard/repairs",
            dedupe_key=f"repair_overdue:{repair.pk}:{_date_key(repair.expected_return_date)}",
        )

    license_managers = list(users_with_permission("operation.change_softwarelicense"))
    dated_licenses = SoftwareLicense.objects.exclude(license_type=SoftwareLicense.TYPE_PERPETUAL).filter(
        expiry_date__isnull=False, expiry_date__lte=today + datetime.timedelta(days=LICENSE_EXPIRING_DAYS)
    )
    for license_record in dated_licenses:
        expired = license_record.expiry_date < today
        type_ = N.TYPE_LICENSE_EXPIRED if expired else N.TYPE_LICENSE_EXPIRING
        verb = "expired" if expired else "expires"
        emit(
            license_managers,
            type=type_,
            title=f"License {license_record.license_id} {verb}",
            message=f"{license_record.name} {verb} on {_day(license_record.expiry_date)}.",
            priority=N.PRIORITY_HIGH if expired else N.PRIORITY_NORMAL,
            target_type="software_license",
            target_id=license_record.pk,
            action_url="/dashboard/software-licenses",
            dedupe_key=f"{type_}:{license_record.pk}:{_date_key(license_record.expiry_date)}",
        )

    return created
