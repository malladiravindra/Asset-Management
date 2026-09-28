"""Roles & Permissions service layer.

A role is a django.contrib.auth Group (name + permissions + members via
User.groups) plus an optional accounts.RoleProfile row for description /
active flag / bookkeeping. There is no separate role or user-role table.

The three built-in roles are created by migration
accounts/0008_seed_default_roles, which also mapped the users that existed
at the time (staff/superuser -> Administrator, everyone else -> Standard
User). Accounts created afterwards through register/ or forgot-password/
get DEFAULT_ROLE_NAME (read-only Viewer) via assign_default_role().
"""
from django.contrib.auth.models import Group, Permission
from django.db.models import Q

from aduitlog.services import create_audit_log

ROLE_ADMINISTRATOR = "Administrator"
ROLE_STANDARD = "Standard User"
ROLE_VIEWER = "Viewer"
DEFAULT_ROLE_NAME = ROLE_VIEWER

# Every model whose API is guarded by accounts.permissions.ModelPermission,
# with the actions that guard means something for. This IS the permission
# catalogue the Roles screen offers — Django's other auto-generated
# permissions (sessions, contenttypes, OTP rows, token blacklist...) are
# not enforced by any API, so granting them would only mislead.
CRUD = ("view", "add", "change", "delete")
CATALOGUE = {
    ("assets", "asset"): CRUD,
    ("assets", "employee"): CRUD,
    ("assets", "department"): CRUD,
    ("assets", "location"): CRUD,
    ("catalog", "category"): CRUD,
    ("catalog", "brand"): CRUD,
    ("catalog", "model"): CRUD,
    ("organization", "vendor"): CRUD,
    ("operation", "maintenancerecord"): CRUD,
    ("operation", "repairrecord"): CRUD,
    ("operation", "accessory"): CRUD,
    ("operation", "accessoryassignment"): ("view", "add"),
    ("operation", "softwarelicense"): CRUD,
    ("operations", "purchaseorder"): CRUD,
    ("operations", "assignment"): CRUD,
    ("operations", "return"): CRUD,
    ("aduitlog", "auditlog"): CRUD,
    ("system_settings", "systemsettings"): ("view", "change"),
    ("auth", "group"): CRUD,
    ("auth", "user"): ("view", "change"),
    ("auth", "permission"): ("view",),
}

# Role and user-role management. Held only by Administrator by default.
ROLE_ADMIN_PERMISSIONS = {"auth.view_group", "auth.add_group", "auth.change_group", "auth.delete_group"}


def catalogue_q():
    q = Q(pk__in=[])
    for (app_label, model), actions in CATALOGUE.items():
        q |= Q(
            content_type__app_label=app_label,
            content_type__model=model,
            codename__in=[f"{action}_{model}" for action in actions],
        )
    return q


def permission_catalogue():
    return (
        Permission.objects.filter(catalogue_q())
        .select_related("content_type")
        .order_by("content_type__app_label", "content_type__model", "codename")
    )


def permission_label(permission):
    return f"{permission.content_type.app_label}.{permission.codename}"


def assign_default_role(user):
    """Give a newly created account the minimum role. Missing or deactivated
    default role -> no role at all (no business access), never more."""
    group = Group.objects.filter(name=DEFAULT_ROLE_NAME).first()
    if group is not None:
        user.groups.add(group)
    return group


def ungrantable_permissions(actor, permissions):
    """Permissions in `permissions` the actor doesn't hold themselves. A
    non-superuser role administrator may only hand out what they have, so
    auth.change_group can't be used to escalate one's own access."""
    if actor.is_superuser:
        return []
    held = actor.get_all_permissions()
    return sorted(label for label in map(permission_label, permissions) if label not in held)


def log_permission_change(*, action, title, actor, context=""):
    """Audit a role/permission/membership change. Gated by Settings > Audit
    Logs > Track Permission Changes (see audit_event_enabled)."""
    return create_audit_log(
        action=action,
        title=title,
        actor=actor,
        context=context if len(context) <= 255 else context[:252] + "...",
        permission_change=True,
    )
