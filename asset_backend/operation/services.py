"""Business logic that touches more than one model in one operation — kept
out of serializers.py/views.py, mirroring operations/services.py's layering
for Assignment/Return. create_accessory_assignment is the accessory
equivalent of operations.services.create_assignment: it creates the history
row AND keeps Accessory.assigned_qty in lockstep, inside one transaction."""

import functools
import time

from django.db import OperationalError, transaction

from aduitlog.models import AuditLog
from aduitlog.services import create_audit_log

from .models import Accessory, AccessoryAssignment, MaintenanceRecord, RepairRecord


class InsufficientStockError(Exception):
    """Raised by create_accessory_assignment when the requested quantity
    exceeds the accessory's available stock as of the row lock — the
    race-safe re-check behind AccessoryAssignmentSerializer.validate()'s
    fast-path check (see AssetAlreadyAssignedError in operations/services.py
    for why both checks exist: the fast-path one runs before this
    transaction/lock starts, so it can't see a conflicting write made by
    another concurrent request)."""

    def __init__(self, accessory, requested, available):
        self.accessory = accessory
        self.requested = requested
        self.available = available
        super().__init__(
            f"Accessory {accessory.pk} has only {available} available, requested {requested}."
        )


def _retry_on_sqlite_table_lock(func):
    """See operations/services.py's identical helper for the full
    rationale — SQLite has no real row-level locking for
    select_for_update() to take, so under contention it can raise
    OperationalError("database table is locked") immediately instead of
    blocking; retry a few times with a short backoff before giving up. On
    Postgres/MySQL, select_for_update() just blocks, so this loop only
    ever runs its function once there."""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        last_error = None
        for attempt in range(5):
            try:
                return func(*args, **kwargs)
            except OperationalError as exc:
                if "locked" not in str(exc).lower():
                    raise
                last_error = exc
                time.sleep(0.05 * (attempt + 1))
        raise last_error

    return wrapper


@_retry_on_sqlite_table_lock
@transaction.atomic
def create_accessory_assignment(*, accessory, employee, quantity, assigned_date, notes="", actor=None):
    """Issue `quantity` units of `accessory` to `employee`: create the
    history row and increment Accessory.assigned_qty atomically.

    Locks the Accessory row (select_for_update) for the duration of this
    transaction before re-checking available stock and claiming it —
    closes the same TOCTOU race operations.services.create_assignment
    closes for Asset (see its docstring): a concurrent assignment against
    the same accessory blocks here until this transaction commits/rolls
    back, then sees this assignment's up-to-date assigned_qty.

    `actor` is the authenticated user who requested the assignment,
    recorded on the audit-log entry inside this same transaction."""
    accessory = Accessory.objects.select_for_update().get(pk=accessory.pk)
    available = accessory.total_qty - accessory.assigned_qty
    if quantity > available:
        raise InsufficientStockError(accessory, quantity, available)

    assignment = AccessoryAssignment.objects.create(
        accessory=accessory,
        employee=employee,
        quantity=quantity,
        assigned_date=assigned_date,
        notes=notes or "",
    )
    accessory.assigned_qty += quantity
    accessory.save(update_fields=["assigned_qty", "updated_at"])
    create_audit_log(
        action=AuditLog.ACTION_ASSIGN,
        title=f"{quantity} x {accessory.name} ({accessory.sku}) assigned to {employee.name}",
        actor=actor,
        context=employee.department.name if employee.department_id else "",
    )
    return assignment


# ------------------------------------------------ Asset service status sync

OPEN_MAINTENANCE_STATUSES = (MaintenanceRecord.STATUS_SCHEDULED, MaintenanceRecord.STATUS_IN_PROGRESS)
OPEN_REPAIR_STATUSES = (RepairRecord.STATUS_REPORTED, RepairRecord.STATUS_IN_PROGRESS)


def sync_asset_service_status(asset_id, *, actor=None):
    """Recompute Asset.status from the asset's open Repair/Maintenance
    records. Call inside the same transaction that created/updated/deleted
    the record, so the record and the asset status commit (or roll back)
    together — the frontend no longer PATCHes the asset separately.

    - any open repair            -> In Repair
    - else any open maintenance  -> Maintenance
    - else, if the asset is still parked in In Repair/Maintenance, release
      it to Assigned (it has an assignee) or Available. Any other status
      (e.g. Reserved) is left alone — only service holds are released.
    """
    from assets.models import Asset

    asset = Asset.objects.select_for_update().get(pk=asset_id)
    if RepairRecord.objects.filter(asset_id=asset_id, status__in=OPEN_REPAIR_STATUSES).exists():
        target = Asset.STATUS_IN_REPAIR
    elif MaintenanceRecord.objects.filter(asset_id=asset_id, status__in=OPEN_MAINTENANCE_STATUSES).exists():
        target = Asset.STATUS_MAINTENANCE
    elif asset.status in (Asset.STATUS_IN_REPAIR, Asset.STATUS_MAINTENANCE):
        target = Asset.STATUS_ASSIGNED if asset.assigned_to_id else Asset.STATUS_AVAILABLE
    else:
        return asset

    if asset.status != target:
        previous = asset.status
        asset.status = target
        asset.save(update_fields=["status", "updated_at"])
        create_audit_log(
            action=AuditLog.ACTION_UPDATE,
            title=f"{asset.asset_code} status changed from {previous} to {target}",
            actor=actor,
        )
    return asset
