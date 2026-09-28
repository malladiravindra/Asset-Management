from django.contrib.auth.backends import ModelBackend
from django.contrib.auth.models import Permission


class RoleAwareModelBackend(ModelBackend):
    """Django's ModelBackend, except that a role (Group) switched off in
    Roles & Permissions (RoleProfile.is_active=False) contributes no
    permissions. Authentication itself is unchanged, and groups without a
    RoleProfile row behave exactly as in stock Django."""

    def _get_group_permissions(self, user_obj):
        active_groups = user_obj.groups.exclude(role_profile__is_active=False)
        return Permission.objects.filter(group__in=active_groups)
