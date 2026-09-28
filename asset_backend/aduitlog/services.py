"""Central, reusable audit-log recording — the ONE place that knows how to
turn "something happened" into an AuditLog row. Every backend operation
that needs to record an audit event calls create_audit_log() (or the
convenience wrappers below) instead of constructing AuditLog objects
itself, so the actor-name-snapshot / validation logic below never has to
be duplicated across assets/views.py, operations/services.py, etc.

Callers are expected to call this AFTER the real operation has already
succeeded, and — where the underlying operation already runs inside
transaction.atomic() (e.g. operations.services.create_assignment/
process_return) — from inside that same block, so a rollback of the real
operation also rolls back its audit entry.
"""
from .models import AuditLog


def _display_name(user):
    if user is None:
        return "System"
    full_name = user.get_full_name().strip() if hasattr(user, "get_full_name") else ""
    if full_name:
        return full_name
    return getattr(user, "email", "") or getattr(user, "username", "") or "System"


def create_audit_log(*, action, title, actor=None, context="", respect_settings=True, permission_change=False):
    """Create one AuditLog row.

    action  -- one of AuditLog.ACTION_CHOICES (CREATE/UPDATE/ASSIGN/RETURN/DELETE).
    title   -- human-readable description, e.g. "Asset AF-0003 created".
    actor   -- the authenticated User who performed the action, or None for
               a system-generated event. Never taken from client-submitted
               request data — always the resolved request.user.
    context -- optional extra detail (e.g. a department name).
    respect_settings -- when True (the default for automatic events), skip
               recording if Settings > Audit Logs has disabled logging or
               tracking for this action; returns None in that case. Manual
               entries and settings changes pass False so they are always kept.
    permission_change -- True for role/permission/role-membership events
               (accounts.roles); gated by Settings > Audit Logs > Track
               Permission Changes instead of the per-action toggle.
    """
    if action not in dict(AuditLog.ACTION_CHOICES):
        raise ValueError(f"Unknown audit log action: {action!r}")
    if not title or not title.strip():
        raise ValueError("Audit log title cannot be empty.")
    if respect_settings:
        from system_settings.services import audit_event_enabled

        if not audit_event_enabled(action, permission_change=permission_change):
            return None

    actor_id = getattr(actor, "pk", None) if actor is not None else None
    return AuditLog.objects.create(
        action=action,
        title=title.strip(),
        actor_id=actor_id,
        actor_name=_display_name(actor),
        context=(context or "").strip(),
    )
