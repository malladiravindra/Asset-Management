"""The one DRF permission class every business APIView uses to enforce
Roles & Permissions on the server. The frontend hides buttons from the same
permission list (GET /api/accounts/me/), but that is presentation only —
this class is what actually rejects an unauthorized request with 403.

A view declares what it guards in one of two ways:

    permission_model = Asset
        GET/HEAD/OPTIONS -> assets.view_asset
        POST             -> assets.add_asset
        PUT/PATCH        -> assets.change_asset
        DELETE           -> assets.delete_asset

    required_permissions = {"POST": ["assets.add_asset", "assets.change_asset"]}
        explicit codenames per method (overrides permission_model for the
        methods it lists), for views that don't map onto one model's CRUD.

Permissions come from the user's roles (django.contrib.auth Groups, via
accounts.backends.RoleAwareModelBackend); an active superuser passes every
check, exactly as in Django's own has_perm().
"""
from django.core.exceptions import ImproperlyConfigured
from rest_framework.permissions import BasePermission

METHOD_ACTIONS = {
    "GET": "view",
    "HEAD": "view",
    "OPTIONS": "view",
    "POST": "add",
    "PUT": "change",
    "PATCH": "change",
    "DELETE": "delete",
}


def model_permission(model, action):
    return f"{model._meta.app_label}.{action}_{model._meta.model_name}"


def required_permissions(view, method):
    """Codenames `method` needs on `view`, or None when the view grants that
    method nothing (the request is then denied)."""
    explicit = getattr(view, "required_permissions", None) or {}
    model = getattr(view, "permission_model", None)
    if not explicit and model is None:
        raise ImproperlyConfigured(
            f"{view.__class__.__name__} uses ModelPermission but declares neither "
            "permission_model nor required_permissions."
        )
    if method in ("HEAD", "OPTIONS") and method not in explicit and "GET" in explicit:
        method = "GET"
    if method in explicit:
        return list(explicit[method])
    action = METHOD_ACTIONS.get(method)
    if model is None or action is None:
        return None
    return [model_permission(model, action)]


class ModelPermission(BasePermission):
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        perms = required_permissions(view, request.method)
        if perms is None:
            return False
        return user.has_perms(perms)


class StaffOrModelPermission(ModelPermission):
    """ModelPermission that also admits is_staff — only for the endpoints that
    were staff-only before roles existed (settings writes, audit-log writes),
    so existing administrators keep exactly the access they had."""

    def has_permission(self, request, view):
        user = request.user
        if user and user.is_authenticated and user.is_staff:
            return True
        return super().has_permission(request, view)
