"""Read-side helpers other apps use to honour SystemSettings.

Kept free of view/serializer imports so code generators in assets/,
operations/, operation/ and organization/ can call these without pulling in
DRF machinery. Every helper reads the singleton fresh (one indexed PK
lookup) so a saved change takes effect on the very next request, with no
cache to invalidate.
"""
import re

from .models import SystemSettings

NUMBER_TOKEN = "{NUMBER}"
_TOKEN_RE = re.compile(r"\{[A-Z]+\}")
_LITERAL_RE = re.compile(r"^[A-Za-z0-9\-_/.]*$")
PREFIX_RE = re.compile(r"^[A-Za-z0-9]{1,10}$")

# Fields whose value is fixed by a database constraint elsewhere in the
# project. The API reports them (so the UI can show *why* a toggle is
# locked) and rejects attempts to change them, instead of storing a value
# the rest of the system would silently ignore.
LOCKED_FIELDS = {
    "allow_duplicate_serial_numbers": (
        False,
        "Asset serial numbers are unique at the database level (Asset.serial_number).",
    ),
    "require_serial_number": (
        True,
        "Serial number is a mandatory column on every asset (Asset.serial_number).",
    ),
    "po_require_vendor": (
        True,
        "Every purchase order must reference a vendor (PurchaseOrder.vendor).",
    ),
}


# Fields some other part of the backend actually reads today. Everything
# else (neither here nor in LOCKED_FIELDS) is validated and persisted but not
# yet consumed by any module — reported as "stored" so the UI and API never
# imply a setting is enforced when it isn't.
ACTIVE_FIELDS = {
    # assets.codes.next_asset_code
    "asset_code_prefix", "asset_number_format", "starting_asset_number",
    # operations.codes.next_po_number
    "po_prefix", "po_number_format",
    # organization.codes.next_employee_id
    "employee_id_prefix",
    # operation.codes.next_repair_id
    "repair_number_prefix",
    # aduitlog.services.create_audit_log (via audit_event_enabled below)
    "audit_logging_enabled", "audit_track_create", "audit_track_update", "audit_track_delete",
    # system_settings.views.TestEmailAPIView (sender identity + message text)
    "email_sender_name", "email_sender_email", "system_name", "organization_name",
    # system_settings.validators.SettingsPasswordPolicyValidator
    # (AUTH_PASSWORD_VALIDATORS → register + reset-password)
    "minimum_password_length", "password_require_uppercase", "password_require_lowercase",
    "password_require_number", "password_require_special",
    # accounts.utils otp_expiry()/resend_cooldown()
    "otp_expiry_minutes", "otp_resend_interval_seconds",
    # accounts.utils login lockout, used by accounts.views.LoginView
    "max_login_attempts", "account_lockout_minutes",
    # system_settings.middleware.MaintenanceModeMiddleware (+ frontend banner)
    "maintenance_mode", "maintenance_message",
    # accounts.views LoginView/LogoutView → create_audit_log(LOGIN/LOGOUT)
    "audit_track_login", "audit_track_logout",
    # operation.serializers MaintenanceRecordSerializer / RepairRecordSerializer
    "default_maintenance_status", "allow_preventive_maintenance", "allow_maintenance_scheduling",
    "default_repair_status", "require_repair_cost",
    # operations.serializers PurchaseOrderSerializer / AssignmentSerializer
    "default_po_status", "allow_partial_receiving", "allow_reassignment",
    # Frontend consumers (read from GET /api/settings/):
    #   components/assets/table.tsx openAddModal — Add Asset form defaults
    "default_asset_status", "default_asset_condition", "default_department", "default_location",
    # notifications.services.notifications_enabled — checked before every
    # in-app notification is created (events + generate_notifications)
    "inapp_notifications_enabled", "inapp_notify_assignment", "inapp_notify_maintenance", "inapp_notify_repair",
    "inapp_notify_purchase_order",
    # accounts.roles.log_permission_change (via audit_event_enabled)
    "audit_track_permission_changes",
}

_NO_EMAIL_NOTIFICATIONS = "The application sends no notification emails (only password-reset OTPs), so there is nothing for this toggle to control."
_NO_MANUAL_CODES = "Codes are server-generated with no manual-entry field in the API or forms; switching generation off would make it impossible to create records."
_PRESENTATION = "Not read anywhere yet: dates, times and amounts are formatted inside each frontend module, so applying this means changing every module."

# Why each stored-only field is not enforced. Returned by GET /api/settings/
# (meta.stored_reasons) and shown as the "Saved only" tooltip.
STORED_REASONS = {
    "organization_logo_url": "Not displayed anywhere yet (reports print the page; there is no report header template).",
    "company_email": "Informational; no module reads it yet.",
    "company_phone": "Informational; no module reads it yet.",
    "address": "Informational; no module reads it yet.",
    "city": "Informational; no module reads it yet.",
    "state": "Informational; no module reads it yet.",
    "country": "Informational; no module reads it yet.",
    "timezone": _PRESENTATION,
    "date_format": _PRESENTATION,
    "time_format": _PRESENTATION,
    "currency": _PRESENTATION,
    "default_language": "The application has no translations (English only).",
    "allow_multiple_locations": "No single-location mode exists to switch to; Locations are always multi-record.",
    "allow_multiple_departments": "No single-department mode exists to switch to; Departments are always multi-record.",
    "auto_generate_employee_id": _NO_MANUAL_CODES,
    "auto_generate_asset_code": _NO_MANUAL_CODES,
    "auto_generate_po_number": _NO_MANUAL_CODES,
    "auto_generate_repair_number": _NO_MANUAL_CODES,
    "auto_generate_assignment_number": "Assignments have no number field in the database.",
    "assignment_number_prefix": "Assignments have no number field in the database.",
    "require_asset_image": "Assets have no image field in the database.",
    "allow_asset_disposal": "There is no disposal feature or Disposed status to allow or block.",
    "require_disposal_approval": "There is no disposal feature to approve.",
    "po_require_approval": "There is no approval step: any user with the change-purchase-order permission can set a PO to Approved.",
    "po_approval_threshold": "Depends on an approval workflow that does not exist (see Require Purchase Order Approval).",
    "require_employee_acknowledgement": "There is no acknowledgement step or field on assignments.",
    "require_return_confirmation": "There is no separate confirmation step; a return is recorded in one action.",
    "allow_multiple_assets_per_assignment": "The Assignment model holds exactly one asset per record.",
    "require_assignment_notes": "Assignments have no notes field in the database.",
    "maintenance_reminder_enabled": "There are no upcoming-maintenance reminders; notifications only flag overdue work.",
    "maintenance_reminder_days": "There are no upcoming-maintenance reminders; notifications only flag overdue work.",
    "send_maintenance_email": _NO_EMAIL_NOTIFICATIONS,
    "maintenance_notification_days": "There are no upcoming-maintenance notifications; only overdue work is flagged.",
    "require_repair_description": "Repairs have no description field; the required 'issue' field already captures it.",
    "notify_employee_on_repair_completion": _NO_EMAIL_NOTIFICATIONS,
    "notify_admin_on_repair_completion": _NO_EMAIL_NOTIFICATIONS,
    "email_notifications_enabled": _NO_EMAIL_NOTIFICATIONS,
    "email_notify_assignment": _NO_EMAIL_NOTIFICATIONS,
    "email_notify_return": _NO_EMAIL_NOTIFICATIONS,
    "email_notify_maintenance": _NO_EMAIL_NOTIFICATIONS,
    "email_notify_repair": _NO_EMAIL_NOTIFICATIONS,
    "email_notify_purchase_order": _NO_EMAIL_NOTIFICATIONS,
    "email_notify_account": "The only account email is the password-reset OTP; disabling it would break password recovery, so it is deliberately not wired.",
    "email_notify_audit": _NO_EMAIL_NOTIFICATIONS,
    "session_timeout_minutes": "JWT lifetimes are fixed in SIMPLE_JWT and the frontend refreshes tokens silently; a real idle timeout needs a redesign of token issuing/refresh.",
    "password_expiry_days": "The user model has no password-changed date to measure expiry from.",
    "default_report_format": "Reports offer only fixed PDF (print) and CSV buttons; there is no format selection or Excel export.",
    "default_report_date_range": "Reports have no date-range filter.",
    "report_include_logo": "Report exports have no configurable sections (PDF is a print of the page, CSV has fixed columns).",
    "report_include_generated_date": "Report exports have no configurable sections (PDF is a print of the page, CSV has fixed columns).",
    "report_include_generated_by": "Report exports have no configurable sections (PDF is a print of the page, CSV has fixed columns).",
    "report_include_asset_details": "Report exports have no configurable sections (PDF is a print of the page, CSV has fixed columns).",
    "report_include_financial_info": "Report exports have no configurable sections (PDF is a print of the page, CSV has fixed columns).",
    "audit_retention_days": "No scheduled job exists to purge records, and deleting audit history automatically is a compliance decision; kept as policy only.",
}

FIELD_STATUS_ACTIVE = "active"
FIELD_STATUS_STORED = "stored"
FIELD_STATUS_LOCKED = "locked"


def field_status(field_names):
    """Map each settings field to active / stored / locked."""
    status = {}
    for name in field_names:
        if name in LOCKED_FIELDS:
            status[name] = FIELD_STATUS_LOCKED
        elif name in ACTIVE_FIELDS:
            status[name] = FIELD_STATUS_ACTIVE
        else:
            status[name] = FIELD_STATUS_STORED
    return status


def get_system_settings():
    return SystemSettings.load()


def validate_code_format(fmt, allowed_tokens):
    """Return an error message for an invalid code format, or None.

    Rules: {NUMBER} must appear exactly once and be the final token (the
    generators find the next sequence by scanning everything before it),
    only the listed tokens are allowed, and literal text is limited to
    letters, digits and - _ / . so generated codes stay URL/CSV safe.
    """
    if not fmt:
        return "Format cannot be blank."
    if fmt.count(NUMBER_TOKEN) != 1 or not fmt.endswith(NUMBER_TOKEN):
        return "Format must end with {NUMBER}, and use it exactly once."
    tokens = set(_TOKEN_RE.findall(fmt))
    unknown = tokens - set(allowed_tokens) - {NUMBER_TOKEN}
    if unknown:
        allowed = ", ".join(sorted(set(allowed_tokens) | {NUMBER_TOKEN}))
        return f"Unknown token(s) {', '.join(sorted(unknown))}. Allowed: {allowed}."
    literal = _TOKEN_RE.sub("", fmt)
    if not _LITERAL_RE.match(literal):
        return "Only letters, digits and - _ / . are allowed outside of tokens."
    return None


def render_code_prefix(fmt, **values):
    """Render everything before {NUMBER}, e.g. 'AF-LT-' for
    '{PREFIX}-{CATEGORY}-{NUMBER}' with prefix='AF', category='LT'."""
    head = fmt[: fmt.index(NUMBER_TOKEN)]
    for key, value in values.items():
        head = head.replace("{" + key.upper() + "}", str(value))
    return head


def next_sequence(existing_values, prefix, floor):
    """Highest numeric suffix after `prefix` among existing codes (never
    lower than `floor`) plus one — deleted numbers are never reused."""
    max_seq = floor
    for value in existing_values:
        suffix = value[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return max_seq + 1


def audit_event_enabled(action, permission_change=False):
    """Whether an automatic audit entry for `action` should be recorded.
    ASSIGN/RETURN follow the master switch only; CREATE/UPDATE/DELETE/
    LOGIN/LOGOUT also follow their individual tracking toggles. Role and
    permission changes (permission_change=True) follow the master switch
    plus Track Permission Changes instead of the per-action toggles."""
    s = get_system_settings()
    if not s.audit_logging_enabled:
        return False
    if permission_change:
        return s.audit_track_permission_changes
    per_action = {
        "CREATE": s.audit_track_create,
        "UPDATE": s.audit_track_update,
        "DELETE": s.audit_track_delete,
        "LOGIN": s.audit_track_login,
        "LOGOUT": s.audit_track_logout,
    }
    return per_action.get(action, True)
