"""Business logic that touches more than one model/app in one operation —
kept out of serializers.py (which stays about shape/validation) and out of
views.py (which stays about HTTP), per the "keep business logic out of the
frontend" / layered-app instruction. Every function here runs inside a
single DB transaction, so a partial failure never leaves the Asset's
status/assigned_to out of sync with the Assignment/Return that's supposed
to own it — Assignment + Return are the source of truth for "who has what,
and since when"; Asset.status/assigned_to are kept in lockstep as a
convenience for everything that already reads Asset directly (the Assets
page, catalog stats, etc.)."""

import functools
import time

from django.db import OperationalError, transaction

from aduitlog.models import AuditLog
from aduitlog.services import create_audit_log
from assets.models import Asset
from notifications.services import notify_assignment_created, notify_return_processed

from .models import Assignment, Return

# Return.condition has an "Excellent" option the Asset model's own
# condition field doesn't (Asset.CONDITION_CHOICES is Good/Fair/Poor only)
# — downgrade it on the way in, same mapping the frontend mock used
# (components/returns/table.tsx downgradeCondition).
_ASSET_CONDITION_FOR_RETURN = {
    Return.CONDITION_EXCELLENT: Asset.CONDITION_GOOD,
    Return.CONDITION_GOOD: Asset.CONDITION_GOOD,
    Return.CONDITION_FAIR: Asset.CONDITION_FAIR,
    Return.CONDITION_POOR: Asset.CONDITION_POOR,
}


class AssetAlreadyAssignedError(Exception):
    """Raised by create_assignment/update_assignment when the Asset row
    they're about to claim (after acquiring its row lock — see
    select_for_update() calls below) turns out to already be actively held
    by a different Assignment. This is the race-safe, lock-protected
    twin of the fast-path check in AssignmentSerializer.validate(): that
    check runs before this transaction/lock even starts, so it can't see a
    conflicting write made by another request that's concurrently inside
    its own transaction; this one re-checks after the row lock is held, so
    it always sees the up-to-date state (on database backends that support
    row locking — see the SQLite note on each lock call). Caught and
    translated to the same DRF ValidationError the fast-path check raises
    by AssignmentSerializer.create()/update() in serializers.py, so callers
    can't tell which check caught the conflict."""

    def __init__(self, asset):
        self.asset = asset
        super().__init__(f"Asset {asset.pk} is already actively assigned.")


def _retry_on_sqlite_table_lock(func):
    """SQLite has no row-level locks for select_for_update() to actually
    take (see the docstrings below) — under genuine concurrent writes it
    falls back to a much coarser table-level lock, and when two
    connections collide on that (the "shared cache" in-memory database
    Django's test runner uses for TransactionTestCase makes this easy to
    hit) sqlite3 raises OperationalError("database table is locked")
    immediately instead of blocking/retrying the way Django's own
    busy_timeout handles the plain "database is locked" case — this is a
    known sqlite3/Django limitation (no unlock-notify support), not
    something select_for_update() or a longer timeout can fix. Retry the
    whole call (a fresh @transaction.atomic attempt each time) a few times
    with a short backoff before giving up, so a losing request gets a
    brief delay-then-retry instead of an unhandled 500. On Postgres/MySQL,
    select_for_update() blocks the second transaction until the first
    commits instead of erroring, so this loop only ever runs its function
    once there."""

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
def create_assignment(*, asset, person, assigned_date, actor=None):
    """Create a new Assignment cycle and mark the asset held. Callers are
    expected to have already checked the asset isn't already actively
    assigned (see AssignmentSerializer.validate) — this just performs the
    write side of that transition atomically.

    `actor` is the authenticated user who requested the assignment (passed
    through from the view via the serializer's context) — recorded on the
    resulting audit-log entry inside this same transaction, so a rollback
    of the assignment also rolls back its audit entry.

    Locks the Asset row (select_for_update) for the duration of this
    transaction before re-checking and claiming it — closes the TOCTOU
    race between AssignmentSerializer.validate()'s fast-path "already
    assigned" check (which runs before this transaction starts) and the
    write below: a concurrent create/update targeting the same asset
    blocks here until this transaction commits or rolls back, then its own
    re-check sees this assignment's up-to-date state. On database backends
    without row-locking support (SQLite — see has_select_for_update in
    Django's sqlite3 backend features) select_for_update() is silently
    ignored, so this is a no-op there; the real protection applies on
    Postgres/MySQL."""
    asset = Asset.objects.select_for_update().get(pk=asset.pk)
    already_assigned = Assignment.objects.filter(
        asset=asset, status=Assignment.STATUS_ASSIGNED
    ).exists()
    if already_assigned:
        raise AssetAlreadyAssignedError(asset)

    assignment = Assignment.objects.create(asset=asset, person=person, assigned_date=assigned_date)
    asset.status = Asset.STATUS_ASSIGNED
    asset.assigned_to = person
    asset.save(update_fields=["status", "assigned_to", "updated_at"])
    create_audit_log(
        action=AuditLog.ACTION_ASSIGN,
        title=f"{asset.asset_code} assigned to {person.name}",
        actor=actor,
        context=person.department.name if person.department_id else "",
    )
    # Same transaction: a rolled-back assignment leaves no notification.
    notify_assignment_created(assignment, actor=actor)
    return assignment


@_retry_on_sqlite_table_lock
@transaction.atomic
def process_return(*, assignment, return_date, condition=None, reason="", actor=None):
    """End an Assignment: create its Return, flip the Assignment to
    Unassigned, and free up the Asset (Available, unassigned, condition
    updated if one was reported). Used by both the Returns page's full
    "Process Return" form and the Assignments page's quick "Unassign"
    action — the latter just omits condition/reason.

    `actor` is the authenticated user who requested the return — see
    create_assignment's docstring for why the audit entry is recorded
    inside this same transaction.

    Locks the Asset row for the duration of this transaction (see
    create_assignment's docstring for why/how) before freeing it up —
    defense-in-depth against a concurrent request racing to read/write the
    same Asset row while this return is in flight."""
    asset = Asset.objects.select_for_update().get(pk=assignment.asset_id)

    return_record = Return.objects.create(
        assignment=assignment,
        return_date=return_date,
        condition=condition or None,
        reason=reason or "",
    )
    assignment.status = Assignment.STATUS_UNASSIGNED
    assignment.save(update_fields=["status", "updated_at"])

    person = assignment.person
    asset.status = Asset.STATUS_AVAILABLE
    asset.assigned_to = None
    if condition:
        asset.condition = _ASSET_CONDITION_FOR_RETURN.get(condition, asset.condition)
    asset.save(update_fields=["status", "assigned_to", "condition", "updated_at"])
    create_audit_log(
        action=AuditLog.ACTION_RETURN,
        title=f"{asset.asset_code} returned by {person.name}",
        actor=actor,
        context=person.department.name if person.department_id else "",
    )
    notify_return_processed(return_record, actor=actor)
    return return_record


@_retry_on_sqlite_table_lock
@transaction.atomic
def update_assignment(*, instance, validated_data, actor=None):
    """Apply a PATCH/PUT to an existing Assignment, keeping Asset.status/
    assigned_to in sync when the write actually changes `asset` and/or
    `person` — the gap that let AssignmentSerializer's default
    ModelSerializer.update() silently desync both the old and new Asset
    rows (see class docstring in serializers.py). Mirrors create_assignment/
    process_return's pattern: one atomic transaction, Assignment is the
    source of truth, Asset.status/assigned_to just follow it.

    Only syncs Asset state when this Assignment is currently the ACTIVE
    (Assigned) record for its old asset — editing a already-Returned
    Assignment's asset/person (a historical row) must not reach out and
    flip whatever Asset now holds that old asset id back to Available,
    since that asset may have long since been picked up by a different,
    unrelated Assignment (requirement: must not disturb unrelated
    Assignment/Asset records).

    Callers are expected to have already checked the new asset (if
    changing) isn't already actively held by a different Assignment (see
    AssignmentSerializer.validate) — this just performs the write side of
    that transition atomically.

    Only locks/re-checks Asset row(s) when this Assignment is currently
    ACTIVE — an edit to a historical (already-Returned) Assignment never
    touches Asset state at all (see was_active guard below), so there is
    nothing to lock in that path (avoids taking an unnecessary lock on an
    Asset row this call won't write to).

    When active, locks every Asset row this update could possibly write to
    (the current asset, and the target asset if `asset` is being changed)
    up front, in a single query ordered by ascending pk — not "old asset,
    then new asset" — before doing anything else. Fixed ascending-pk
    ordering, applied the same way by every caller, is what avoids a
    deadlock: if two concurrent requests were to cross-swap two assets
    (request 1: A -> B, request 2: B -> A), locking in "old, then new"
    order would have request 1 lock A then wait on B while request 2 locks
    B then waits on A — a classic deadlock. Locking both by ascending pk
    instead means both requests try to lock the lower-pk asset first, so
    one of them simply blocks on that first lock (normal, safe contention)
    instead of the two holding-and-waiting on each other. See
    create_assignment's docstring for the SQLite no-op note."""
    old_asset = instance.asset
    old_person = instance.person
    was_active = instance.status == Assignment.STATUS_ASSIGNED

    if was_active:
        candidate_asset = validated_data.get("asset", old_asset)
        lock_pks = sorted({old_asset.pk, candidate_asset.pk})
        locked_assets = {
            a.pk: a for a in Asset.objects.select_for_update().filter(pk__in=lock_pks)
        }
        old_asset = locked_assets[old_asset.pk]
        if "asset" in validated_data:
            validated_data["asset"] = locked_assets[candidate_asset.pk]

            # Re-run the "already actively assigned elsewhere" check under
            # the lock — see AssetAlreadyAssignedError's docstring for why
            # this re-check (rather than just the fast-path check in
            # AssignmentSerializer.validate()) is what actually closes the
            # race on lock-supporting backends.
            target_asset = validated_data["asset"]
            if target_asset.pk != old_asset.pk:
                conflict = (
                    Assignment.objects.filter(asset=target_asset, status=Assignment.STATUS_ASSIGNED)
                    .exclude(pk=instance.pk)
                    .exists()
                )
                if conflict:
                    raise AssetAlreadyAssignedError(target_asset)

    for attr, value in validated_data.items():
        setattr(instance, attr, value)
    instance.save()

    new_asset = instance.asset
    new_person = instance.person
    asset_changed = new_asset.pk != old_asset.pk
    person_changed = new_person.pk != old_person.pk

    if was_active and (asset_changed or person_changed):
        if asset_changed:
            old_asset.status = Asset.STATUS_AVAILABLE
            old_asset.assigned_to = None
            old_asset.save(update_fields=["status", "assigned_to", "updated_at"])

            new_asset.status = Asset.STATUS_ASSIGNED
            new_asset.assigned_to = new_person
            new_asset.save(update_fields=["status", "assigned_to", "updated_at"])
        else:
            # Same asset, different person: just re-point who holds it.
            new_asset.assigned_to = new_person
            new_asset.save(update_fields=["assigned_to", "updated_at"])

        create_audit_log(
            action=AuditLog.ACTION_UPDATE,
            title=f"{new_asset.asset_code} reassigned to {new_person.name}",
            actor=actor,
            context=new_person.department.name if new_person.department_id else "",
        )

    return instance


@_retry_on_sqlite_table_lock
@transaction.atomic
def delete_assignment(assignment):
    """Deleting an Assignment record that's still active also frees up the
    asset it was holding — otherwise the asset would be stuck showing
    Assigned/held with no Assignment row left to explain why.

    Locks the Asset row (only when it's actually about to be written —
    i.e. only for an active assignment) for the duration of this
    transaction; see create_assignment's docstring for why/how."""
    was_active = assignment.status == Assignment.STATUS_ASSIGNED
    asset = assignment.asset
    if was_active:
        asset = Asset.objects.select_for_update().get(pk=asset.pk)
    assignment.delete()
    if was_active:
        asset.status = Asset.STATUS_AVAILABLE
        asset.assigned_to = None
        asset.save(update_fields=["status", "assigned_to", "updated_at"])
