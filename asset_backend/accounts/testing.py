"""Test helpers for role-based access. Business endpoints are guarded by
accounts.permissions.ModelPermission, so a test user needs a role to
exercise them — exactly like a real account."""
from django.contrib.auth.models import Group, Permission

from . import roles
from .models import RoleProfile

ROLE_ACTIONS = {
    roles.ROLE_ADMINISTRATOR: None,  # everything in the catalogue
    roles.ROLE_STANDARD: {"view", "add", "change"},
    roles.ROLE_VIEWER: {"view"},
}
ADMIN_ONLY_APPS = {"aduitlog", "system_settings", "auth"}


def ensure_role(name):
    """The role seeded by accounts/0008_seed_default_roles. Rebuilt from
    accounts.roles.CATALOGUE when a TransactionTestCase flush removed it."""
    group, created = Group.objects.get_or_create(name=name)
    if created:
        RoleProfile.objects.get_or_create(group=group)
        allowed = ROLE_ACTIONS[name]
        permissions = []
        for permission in roles.permission_catalogue():
            action = permission.codename.split("_", 1)[0]
            admin_only = permission.content_type.app_label in ADMIN_ONLY_APPS
            if allowed is None or (action in allowed and not admin_only):
                permissions.append(permission)
        if name == roles.ROLE_STANDARD:
            permissions += list(Permission.objects.filter(content_type__app_label="aduitlog", codename="view_auditlog"))
        group.permissions.set(permissions)
    return group


def grant_role(user, name=roles.ROLE_ADMINISTRATOR):
    user.groups.add(ensure_role(name))
    # Drop Django's cached permission sets so the new role applies at once.
    for attr in ("_perm_cache", "_user_perm_cache", "_group_perm_cache"):
        user.__dict__.pop(attr, None)
    return user
