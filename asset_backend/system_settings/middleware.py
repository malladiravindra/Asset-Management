"""Maintenance mode enforcement (Settings > System > Maintenance Mode).

While maintenance_mode is on, API requests from authenticated NON-staff
users get 503 with the configured maintenance message. Staff always pass
through, so an administrator can never be locked out and can turn the mode
off again from Settings.

Always exempt:
  /api/accounts/  — sign-in, token refresh, logout and password reset keep
                    working (staff must be able to sign in to turn it off).
  /api/settings/  — the frontend reads maintenance_mode/maintenance_message
                    from here to show the banner; writes are still staff-only
                    via the view's own permissions.
  anything outside /api/ (Django admin, static files).

Unauthenticated requests pass through untouched so DRF still answers 401.
JWT is validated with the same JWTAuthentication class DRF uses.
"""
from django.http import JsonResponse
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

EXEMPT_PREFIXES = ("/api/accounts/", "/api/settings/")


class MaintenanceModeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.jwt = JWTAuthentication()

    def __call__(self, request):
        path = request.path
        if path.startswith("/api/") and not path.startswith(EXEMPT_PREFIXES) and request.method != "OPTIONS":
            from .services import get_system_settings

            s = get_system_settings()
            if s.maintenance_mode:
                user = self._jwt_user(request)
                if user is not None and user.is_active and not user.is_staff:
                    return JsonResponse(
                        {"detail": s.maintenance_message, "maintenance_mode": True},
                        status=503,
                    )
        return self.get_response(request)

    def _jwt_user(self, request):
        try:
            result = self.jwt.authenticate(request)
        except (InvalidToken, TokenError, Exception):
            return None
        return result[0] if result else None
