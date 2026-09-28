"""Seed the built-in roles and map existing users onto them.

Before this migration every authenticated user could create, update and
delete everything; only settings/audit-log writes were staff-only. Roles
now enforce access on the server (accounts.permissions.ModelPermission), so
existing accounts are mapped deliberately instead of being locked out:

  is_staff or is_superuser  -> Administrator  (every catalogued permission)
  every other existing user -> Standard User  (view/add/change on business
                               data + read audit logs; no delete, no
                               settings, no audit or role management)

Accounts created afterwards get Viewer (read-only) — see
accounts.roles.assign_default_role.

The permission lists are frozen here on purpose (a migration must not
depend on application code that may change later); they mirror
accounts.roles.CATALOGUE as of this migration. Existing group memberships
are never removed.
"""
from django.db import migrations

CRUD = ("view", "add", "change", "delete")
BUSINESS = {
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
}
ADMINISTRATION = {
    ("aduitlog", "auditlog"): CRUD,
    ("system_settings", "systemsettings"): ("view", "change"),
    ("auth", "group"): CRUD,
    ("auth", "user"): ("view", "change"),
    ("auth", "permission"): ("view",),
}


def _codenames(models, allowed_actions=None):
    for (app_label, model), actions in models.items():
        for action in actions:
            if allowed_actions is None or action in allowed_actions:
                yield app_label, f"{action}_{model}"


ROLES = [
    (
        "Administrator",
        "Full access, including settings, audit logs and role management.",
        list(_codenames(BUSINESS)) + list(_codenames(ADMINISTRATION)),
    ),
    (
        "Standard User",
        "View, add and edit business records. Cannot delete, change settings, manage audit logs or manage roles.",
        list(_codenames(BUSINESS, {"view", "add", "change"})) + [("aduitlog", "view_auditlog")],
    ),
    (
        "Viewer",
        "Read-only access to business records. Default role for new accounts.",
        list(_codenames(BUSINESS, {"view"})),
    ),
]


def seed_roles(apps, schema_editor):
    from django.contrib.auth.management import create_permissions

    # Permissions are normally created by post_migrate, i.e. after every
    # migration has run — too late for this one on a fresh database.
    for app_config in apps.get_app_configs():
        app_config.models_module = True
        create_permissions(app_config, apps=apps, verbosity=0)
        app_config.models_module = None

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    RoleProfile = apps.get_model("accounts", "RoleProfile")
    User = apps.get_model("auth", "User")

    groups = {}
    for name, description, codenames in ROLES:
        group, _ = Group.objects.get_or_create(name=name)
        RoleProfile.objects.get_or_create(group=group, defaults={"description": description})
        permissions = []
        for app_label, codename in codenames:
            permission = Permission.objects.filter(content_type__app_label=app_label, codename=codename).first()
            if permission is None:
                raise RuntimeError(f"Permission {app_label}.{codename} does not exist")
            permissions.append(permission)
        group.permissions.add(*permissions)
        groups[name] = group

    for user in User.objects.all():
        target = groups["Administrator"] if (user.is_staff or user.is_superuser) else groups["Standard User"]
        user.groups.add(target)


def unseed_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=[name for name, _, _ in ROLES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_roleprofile"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("aduitlog", "0002_alter_auditlog_action"),
        ("assets", "0014_employee_user"),
        ("catalog", "0005_brand_color_key"),
        ("operation", "0002_accessoryassignment"),
        ("operations", "0004_return_number"),
        ("organization", "0006_vendor_code_unique"),
        ("system_settings", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_roles, unseed_roles),
    ]
