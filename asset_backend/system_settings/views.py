"""
Settings API.

  GET    /api/settings/             current settings + UI metadata (any authenticated user)
  PUT    /api/settings/             full update   (staff only)
  PATCH  /api/settings/             partial update (staff only)
  POST   /api/settings/test-email/  send a real test email via the .env SMTP account (staff only)

Writes need Django's built-in admin flag (User.is_staff — what gates
/admin/) or the system_settings.change_systemsettings role permission (see
accounts.permissions.StaffOrModelPermission). Every authenticated user can
read settings (other modules' UIs need the values) but gets 403 on writes.
"""
import logging
import smtplib
from email.utils import formataddr
from zoneinfo import available_timezones

from django.conf import settings as django_settings
from django.core.mail import EmailMessage, get_connection
from django.db import connection, transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.permissions import StaffOrModelPermission
from aduitlog.models import AuditLog
from aduitlog.services import create_audit_log
from assets.models import Department, Location

from . import models as m
from .models import SystemSettings
from .serializers import SystemSettingsSerializer, TestEmailSerializer
from .services import LOCKED_FIELDS, STORED_REASONS, field_status

logger = logging.getLogger(__name__)

API_VERSION = "v1"
SMTP_TIMEOUT_SECONDS = 15
EDIT_PERMISSION = "system_settings.change_systemsettings"


def _choices(pairs):
    return [{"value": value, "label": label} for value, label in pairs]


def _mask_email(address):
    if not address or "@" not in address:
        return ""
    local, domain = address.split("@", 1)
    return f"{local[:2]}{'*' * max(len(local) - 2, 3)}@{domain}"


def _system_status():
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return "operational"
    except Exception:  # pragma: no cover - only reachable when the DB is down
        logger.exception("settings: database health check failed")
        return "degraded"


def _meta(request):
    """Everything the Settings UI needs besides the values themselves:
    dropdown options (so nothing is hardcoded in the frontend), locked
    fields, read-only SMTP status and system info. Never contains secrets —
    EMAIL_HOST_PASSWORD is reported only as a configured/not-configured flag."""
    return {
        "can_edit": can_edit_settings(request.user),
        "locked_fields": {name: reason for name, (_value, reason) in LOCKED_FIELDS.items()},
        # active = consumed by backend logic today; stored = validated and
        # persisted, not yet read by any module; locked = fixed by a DB constraint.
        "field_status": field_status(SystemSettingsSerializer().fields.keys() - {"updated_at", "updated_by_name"}),
        "stored_reasons": STORED_REASONS,
        "choices": {
            "timezone": sorted(available_timezones()),
            "date_format": _choices(m.DATE_FORMAT_CHOICES),
            "time_format": _choices(m.TIME_FORMAT_CHOICES),
            "currency": _choices(m.CURRENCY_CHOICES),
            "default_language": _choices(m.LANGUAGE_CHOICES),
            "default_report_format": _choices(m.REPORT_FORMAT_CHOICES),
            "default_report_date_range": _choices(m.REPORT_DATE_RANGE_CHOICES),
            "default_asset_status": _choices(SystemSettings._meta.get_field("default_asset_status").choices),
            "default_asset_condition": _choices(SystemSettings._meta.get_field("default_asset_condition").choices),
            "default_po_status": _choices(SystemSettings._meta.get_field("default_po_status").choices),
            "default_maintenance_status": _choices(SystemSettings._meta.get_field("default_maintenance_status").choices),
            "default_repair_status": _choices(SystemSettings._meta.get_field("default_repair_status").choices),
            "default_department": [
                {"value": d["id"], "label": d["name"]} for d in Department.objects.order_by("name").values("id", "name")
            ],
            "default_location": [
                {"value": loc["id"], "label": loc["name"]} for loc in Location.objects.order_by("name").values("id", "name")
            ],
        },
        "email": {
            "smtp_host": getattr(django_settings, "EMAIL_HOST", ""),
            "smtp_port": getattr(django_settings, "EMAIL_PORT", None),
            "smtp_use_tls": bool(getattr(django_settings, "EMAIL_USE_TLS", False)),
            "host_user": _mask_email(getattr(django_settings, "EMAIL_HOST_USER", "")),
            "password_configured": bool(getattr(django_settings, "EMAIL_HOST_PASSWORD", "")),
            "default_from_email": _mask_email(getattr(django_settings, "DEFAULT_FROM_EMAIL", "")),
        },
        "system": {
            "api_version": API_VERSION,
            "system_status": _system_status(),
        },
    }


def can_edit_settings(user):
    return bool(user and user.is_authenticated and (user.is_staff or user.has_perm(EDIT_PERMISSION)))


def _changed_fields(instance, validated_data):
    return sorted(name for name, value in validated_data.items() if getattr(instance, name) != value)


class SystemSettingsAPIView(APIView):
    permission_classes = [IsAuthenticated, StaffOrModelPermission]
    # Reading stays open to every signed-in user (other modules need the
    # values); writing is staff or change_systemsettings.
    required_permissions = {"GET": [], "PUT": [EDIT_PERMISSION], "PATCH": [EDIT_PERMISSION]}

    def _response(self, request, instance, status_code=status.HTTP_200_OK):
        return Response(
            {"settings": SystemSettingsSerializer(instance).data, "meta": _meta(request)},
            status=status_code,
        )

    def get(self, request):
        return self._response(request, SystemSettings.load())

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, partial):
        instance = SystemSettings.load()
        serializer = SystemSettingsSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        changed = _changed_fields(instance, serializer.validated_data)

        # Every successful update is audited unconditionally (respect_settings=False),
        # even when audit tracking is switched off — changes to the configuration
        # itself must always leave a trail. Only field NAMES are recorded, never
        # values. The AuditLog row supplies actor + server timestamp; module and
        # changed fields go into the title/context (the existing AuditLog shape).
        with transaction.atomic():
            instance = serializer.save(updated_by=request.user)
            context = f"Module: Settings | Changed: {', '.join(changed) if changed else 'none'}"
            create_audit_log(
                action=AuditLog.ACTION_UPDATE,
                title="System settings updated",
                actor=request.user,
                context=context if len(context) <= 255 else context[:252] + "...",
                respect_settings=False,
            )
        return self._response(request, instance)


class TestEmailAPIView(APIView):
    """Sends a real message through the SMTP account configured in .env.
    Success/failure is exactly what the SMTP server reported — the frontend
    shows this response verbatim and never assumes success."""

    permission_classes = [IsAuthenticated, StaffOrModelPermission]
    required_permissions = {"POST": [EDIT_PERMISSION]}
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "settings_test_email"

    def post(self, request):
        serializer = TestEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recipient = serializer.validated_data.get("recipient") or request.user.email
        if not recipient:
            return Response(
                {"recipient": ["Your account has no email address. Enter a recipient to send the test to."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        s = SystemSettings.load()
        from_address = s.email_sender_email or django_settings.DEFAULT_FROM_EMAIL
        sender = formataddr((s.email_sender_name, from_address)) if s.email_sender_name else from_address
        message = EmailMessage(
            subject=f"{s.system_name} — test email",
            body=(
                f"This is a test email from {s.system_name} ({s.organization_name}).\n\n"
                "If you received it, outgoing email is configured correctly.\n"
                f"Requested by: {request.user.get_username()}"
            ),
            from_email=sender,
            to=[recipient],
            connection=get_connection(timeout=SMTP_TIMEOUT_SECONDS),
        )
        try:
            message.send(fail_silently=False)
        except smtplib.SMTPAuthenticationError:
            logger.warning("settings: test email SMTP authentication failed")
            return Response(
                {"detail": "SMTP authentication failed. Check EMAIL_HOST_USER / EMAIL_HOST_PASSWORD in the server .env file."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except smtplib.SMTPRecipientsRefused:
            return Response(
                {"recipient": ["The mail server refused this recipient address."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except (smtplib.SMTPException, OSError) as exc:
            logger.warning("settings: test email failed: %s", exc.__class__.__name__)
            return Response(
                {"detail": f"Could not deliver the test email ({exc.__class__.__name__}). Check the SMTP host and network access."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"detail": f"Test email sent to {recipient}.", "recipient": recipient})
