"""
Application-wide configuration for AssetFlow — one singleton row
(SystemSettings, pk=1) that controls *how* the other modules behave.

This model deliberately stores behaviour, never business records: no asset
names, serial numbers, employees or vendors live here (those stay in their
own apps). Default Department / Location are FKs to the real
assets.Department / assets.Location rows rather than copies of them.

Secrets are NOT stored here. SECRET_KEY, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD,
database credentials and JWT signing keys stay in .env / deployment config
(see asset_backend/settings.py). SMTP host/port/TLS are also deployment
config — the Email section of the API only *reports* them, read-only.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from assets.models import Asset
from operation.models import MaintenanceRecord, RepairRecord
from operations.models import PurchaseOrder

SINGLETON_PK = 1

DATE_FORMAT_CHOICES = [
    ("DD/MM/YYYY", "DD/MM/YYYY (23/09/2026)"),
    ("MM/DD/YYYY", "MM/DD/YYYY (09/23/2026)"),
    ("YYYY-MM-DD", "YYYY-MM-DD (2026-09-23)"),
    ("DD MMM YYYY", "DD MMM YYYY (23 Sep 2026)"),
]
TIME_FORMAT_CHOICES = [
    ("12h", "12-hour (02:30 PM)"),
    ("24h", "24-hour (14:30)"),
]
CURRENCY_CHOICES = [
    ("INR", "INR — Indian Rupee (₹)"),
    ("USD", "USD — US Dollar ($)"),
    ("EUR", "EUR — Euro (€)"),
    ("GBP", "GBP — British Pound (£)"),
    ("AED", "AED — UAE Dirham"),
    ("SGD", "SGD — Singapore Dollar"),
    ("AUD", "AUD — Australian Dollar"),
    ("CAD", "CAD — Canadian Dollar"),
    ("JPY", "JPY — Japanese Yen (¥)"),
]
LANGUAGE_CHOICES = [
    ("en-us", "English (United States)"),
    ("en-gb", "English (United Kingdom)"),
]
REPORT_FORMAT_CHOICES = [
    ("pdf", "PDF"),
    ("excel", "Excel"),
    ("csv", "CSV"),
]
REPORT_DATE_RANGE_CHOICES = [
    ("last_7_days", "Last 7 days"),
    ("last_30_days", "Last 30 days"),
    ("last_90_days", "Last 90 days"),
    ("this_month", "This month"),
    ("this_quarter", "This quarter"),
    ("this_year", "This year"),
]


class SystemSettings(models.Model):
    # ── General ─────────────────────────────────────────────────────────────
    organization_name = models.CharField(max_length=150, default="SRIA Infotech")
    # URL rather than an ImageField: the project has no MEDIA_ROOT/MEDIA_URL
    # or upload-serving setup yet, so a file field would have nowhere to live.
    organization_logo_url = models.URLField(max_length=500, blank=True, default="")
    company_email = models.EmailField(blank=True, default="")
    company_phone = models.CharField(max_length=30, blank=True, default="")
    address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="India")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    date_format = models.CharField(max_length=20, choices=DATE_FORMAT_CHOICES, default="DD/MM/YYYY")
    time_format = models.CharField(max_length=5, choices=TIME_FORMAT_CHOICES, default="12h")
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default="INR")

    # ── Organization defaults ───────────────────────────────────────────────
    default_department = models.ForeignKey(
        "assets.Department", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    default_location = models.ForeignKey(
        "assets.Location", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    allow_multiple_locations = models.BooleanField(default=True)
    allow_multiple_departments = models.BooleanField(default=True)
    employee_id_prefix = models.CharField(max_length=10, default="EMP")
    auto_generate_employee_id = models.BooleanField(default=True)

    # ── Asset management ────────────────────────────────────────────────────
    asset_code_prefix = models.CharField(max_length=10, default="AF")
    asset_number_format = models.CharField(max_length=60, default="{PREFIX}-{CATEGORY}-{NUMBER}")
    auto_generate_asset_code = models.BooleanField(default=True)
    starting_asset_number = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(999999)]
    )
    default_asset_status = models.CharField(
        max_length=20, choices=Asset.STATUS_CHOICES, default=Asset.STATUS_AVAILABLE
    )
    default_asset_condition = models.CharField(
        max_length=10, choices=Asset.CONDITION_CHOICES, default=Asset.CONDITION_GOOD
    )
    allow_duplicate_serial_numbers = models.BooleanField(default=False)
    require_serial_number = models.BooleanField(default=True)
    require_asset_image = models.BooleanField(default=False)
    allow_asset_disposal = models.BooleanField(default=False)
    require_disposal_approval = models.BooleanField(default=True)

    # ── Purchase orders ─────────────────────────────────────────────────────
    po_prefix = models.CharField(max_length=10, default="PO")
    po_number_format = models.CharField(max_length=60, default="{PREFIX}-{YEAR}-{NUMBER}")
    auto_generate_po_number = models.BooleanField(default=True)
    default_po_status = models.CharField(
        max_length=20, choices=PurchaseOrder.STATUS_CHOICES, default=PurchaseOrder.STATUS_DRAFT
    )
    po_require_approval = models.BooleanField(default=True)
    po_approval_threshold = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0"))],
    )
    allow_partial_receiving = models.BooleanField(default=True)
    po_require_vendor = models.BooleanField(default=True)

    # ── Assignments ─────────────────────────────────────────────────────────
    assignment_number_prefix = models.CharField(max_length=10, default="ASN")
    auto_generate_assignment_number = models.BooleanField(default=True)
    require_employee_acknowledgement = models.BooleanField(default=False)
    require_return_confirmation = models.BooleanField(default=True)
    allow_multiple_assets_per_assignment = models.BooleanField(default=False)
    allow_reassignment = models.BooleanField(default=True)
    require_assignment_notes = models.BooleanField(default=False)

    # ── Maintenance ─────────────────────────────────────────────────────────
    maintenance_reminder_enabled = models.BooleanField(default=True)
    maintenance_reminder_days = models.PositiveIntegerField(
        default=7, validators=[MaxValueValidator(365)]
    )
    default_maintenance_status = models.CharField(
        max_length=15, choices=MaintenanceRecord.STATUS_CHOICES,
        default=MaintenanceRecord.STATUS_SCHEDULED,
    )
    allow_preventive_maintenance = models.BooleanField(default=True)
    allow_maintenance_scheduling = models.BooleanField(default=True)
    send_maintenance_email = models.BooleanField(default=False)
    maintenance_notification_days = models.PositiveIntegerField(
        default=14, validators=[MaxValueValidator(365)]
    )

    # ── Repairs ─────────────────────────────────────────────────────────────
    default_repair_status = models.CharField(
        max_length=15, choices=RepairRecord.STATUS_CHOICES, default=RepairRecord.STATUS_REPORTED
    )
    repair_number_prefix = models.CharField(max_length=10, default="REP")
    auto_generate_repair_number = models.BooleanField(default=True)
    require_repair_cost = models.BooleanField(default=False)
    require_repair_description = models.BooleanField(default=True)
    notify_employee_on_repair_completion = models.BooleanField(default=True)
    notify_admin_on_repair_completion = models.BooleanField(default=True)

    # ── Notifications ───────────────────────────────────────────────────────
    email_notifications_enabled = models.BooleanField(default=True)
    email_notify_assignment = models.BooleanField(default=True)
    email_notify_return = models.BooleanField(default=True)
    email_notify_maintenance = models.BooleanField(default=True)
    email_notify_repair = models.BooleanField(default=True)
    email_notify_purchase_order = models.BooleanField(default=True)
    email_notify_account = models.BooleanField(default=True)
    email_notify_audit = models.BooleanField(default=False)
    inapp_notifications_enabled = models.BooleanField(default=True)
    inapp_notify_assignment = models.BooleanField(default=True)
    inapp_notify_maintenance = models.BooleanField(default=True)
    inapp_notify_repair = models.BooleanField(default=True)
    inapp_notify_purchase_order = models.BooleanField(default=True)

    # ── Security policy (policy values only — never secrets) ────────────────
    session_timeout_minutes = models.PositiveIntegerField(
        default=30, validators=[MinValueValidator(1), MaxValueValidator(1440)]
    )
    max_login_attempts = models.PositiveIntegerField(
        default=5, validators=[MinValueValidator(1), MaxValueValidator(20)]
    )
    account_lockout_minutes = models.PositiveIntegerField(
        default=15, validators=[MinValueValidator(1), MaxValueValidator(1440)]
    )
    # 0 = passwords never expire.
    password_expiry_days = models.PositiveIntegerField(
        default=90, validators=[MaxValueValidator(3650)]
    )
    minimum_password_length = models.PositiveIntegerField(
        default=8, validators=[MinValueValidator(6), MaxValueValidator(128)]
    )
    password_require_uppercase = models.BooleanField(default=True)
    password_require_lowercase = models.BooleanField(default=True)
    password_require_number = models.BooleanField(default=True)
    password_require_special = models.BooleanField(default=False)
    otp_expiry_minutes = models.PositiveIntegerField(
        default=5, validators=[MinValueValidator(1), MaxValueValidator(60)]
    )
    otp_resend_interval_seconds = models.PositiveIntegerField(
        default=60, validators=[MinValueValidator(15), MaxValueValidator(3600)]
    )

    # ── Email (display identity only — SMTP credentials stay in .env) ───────
    email_sender_name = models.CharField(max_length=100, blank=True, default="AssetFlow")
    # Blank = use DEFAULT_FROM_EMAIL (EMAIL_HOST_USER from .env).
    email_sender_email = models.EmailField(blank=True, default="")

    # ── Reports ─────────────────────────────────────────────────────────────
    default_report_format = models.CharField(max_length=10, choices=REPORT_FORMAT_CHOICES, default="pdf")
    default_report_date_range = models.CharField(
        max_length=20, choices=REPORT_DATE_RANGE_CHOICES, default="last_30_days"
    )
    report_include_logo = models.BooleanField(default=True)
    report_include_generated_date = models.BooleanField(default=True)
    report_include_generated_by = models.BooleanField(default=True)
    report_include_asset_details = models.BooleanField(default=True)
    report_include_financial_info = models.BooleanField(default=False)

    # ── Audit logs ──────────────────────────────────────────────────────────
    audit_logging_enabled = models.BooleanField(default=True)
    audit_track_login = models.BooleanField(default=False)
    audit_track_logout = models.BooleanField(default=False)
    audit_track_create = models.BooleanField(default=True)
    audit_track_update = models.BooleanField(default=True)
    audit_track_delete = models.BooleanField(default=True)
    audit_track_permission_changes = models.BooleanField(default=True)
    # 0 = keep forever. Policy value only: nothing in Settings deletes history.
    audit_retention_days = models.PositiveIntegerField(
        default=365, validators=[MaxValueValidator(3650)]
    )

    # ── System ──────────────────────────────────────────────────────────────
    system_name = models.CharField(max_length=100, default="AssetFlow")
    maintenance_mode = models.BooleanField(default=False)
    maintenance_message = models.TextField(
        blank=True,
        default="The system is undergoing scheduled maintenance. Please check back shortly.",
    )
    default_language = models.CharField(max_length=10, choices=LANGUAGE_CHOICES, default="en-us")

    # ── Bookkeeping ─────────────────────────────────────────────────────────
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "System settings"
        verbose_name_plural = "System settings"

    def __str__(self):
        return "System settings"

    def save(self, *args, **kwargs):
        # Singleton: every save targets the same row, so a second settings
        # record can never be created (admin, shell or API alike).
        self.pk = SINGLETON_PK
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # The global configuration row is never deleted; "reset" means
        # editing values, not dropping the row other modules read from.
        return 0, {}

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=SINGLETON_PK)
        return obj
