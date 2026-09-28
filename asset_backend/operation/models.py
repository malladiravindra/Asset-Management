from django.db import models

# Maintenance, Repairs, Accessories, Software Licenses — the four Operations
# sub-modules this app owns. Maintenance/Repairs deliberately FK to the real
# assets.Asset/assets.Location rather than storing assetTag/assetName/
# category/location as plain strings — those are exposed as read-only
# fields on the serializer, derived live from the FK, so a record never
# drifts out of sync with the asset it's about (same reasoning as
# operations.Assignment/Return referencing assets.Asset/Employee by FK
# instead of duplicating their fields). Accessories/SoftwareLicenses are
# standalone inventory records, not tied to one specific asset, so their
# `vendor` stays plain text (there's no per-record "this asset" to hang a
# vendor FK off of the way Maintenance/Repairs' target asset does) —
# matching the Add forms, which already capture vendor as free text here.


class MaintenanceRecord(models.Model):
    TYPE_PREVENTIVE = "Preventive"
    TYPE_CORRECTIVE = "Corrective"
    TYPE_INSPECTION = "Inspection"
    TYPE_BATTERY_REPLACE = "Battery Replace"
    TYPE_OS_REINSTALL = "OS Reinstall"
    TYPE_SOFTWARE_UPDATE = "Software Update"
    TYPE_CHOICES = [
        (TYPE_PREVENTIVE, "Preventive"),
        (TYPE_CORRECTIVE, "Corrective"),
        (TYPE_INSPECTION, "Inspection"),
        (TYPE_BATTERY_REPLACE, "Battery Replace"),
        (TYPE_OS_REINSTALL, "OS Reinstall"),
        (TYPE_SOFTWARE_UPDATE, "Software Update"),
    ]

    PRIORITY_LOW = "Low"
    PRIORITY_MEDIUM = "Medium"
    PRIORITY_HIGH = "High"
    PRIORITY_CHOICES = [
        (PRIORITY_LOW, "Low"),
        (PRIORITY_MEDIUM, "Medium"),
        (PRIORITY_HIGH, "High"),
    ]

    STATUS_SCHEDULED = "Scheduled"
    STATUS_IN_PROGRESS = "In Progress"
    STATUS_COMPLETED = "Completed"
    STATUS_CANCELLED = "Cancelled"
    STATUS_CHOICES = [
        (STATUS_SCHEDULED, "Scheduled"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    asset = models.ForeignKey(
        "assets.Asset", on_delete=models.PROTECT, related_name="maintenance_records"
    )
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    # Free text, not a fixed choices field — the Add Maintenance form offers
    # a suggested technician list client-side, but any name is acceptable
    # (no separate Technician model exists to FK to).
    technician = models.CharField(max_length=150)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
    scheduled_date = models.DateField()
    completed_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_SCHEDULED)
    cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-scheduled_date", "-id"]

    def __str__(self):
        return f"{self.type} — {self.asset_id}"


class RepairRecord(models.Model):
    ISSUE_SCREEN_DAMAGE = "Screen Damage"
    ISSUE_BATTERY = "Battery Issue"
    ISSUE_KEYBOARD = "Keyboard / Input"
    ISSUE_CHARGING = "Charging / Power"
    ISSUE_MOTHERBOARD = "Motherboard"
    ISSUE_SOFTWARE = "Software / OS"
    ISSUE_WATER_DAMAGE = "Water / Liquid Damage"
    ISSUE_OTHER = "Other Hardware"
    ISSUE_TYPE_CHOICES = [
        (ISSUE_SCREEN_DAMAGE, "Screen Damage"),
        (ISSUE_BATTERY, "Battery Issue"),
        (ISSUE_KEYBOARD, "Keyboard / Input"),
        (ISSUE_CHARGING, "Charging / Power"),
        (ISSUE_MOTHERBOARD, "Motherboard"),
        (ISSUE_SOFTWARE, "Software / OS"),
        (ISSUE_WATER_DAMAGE, "Water / Liquid Damage"),
        (ISSUE_OTHER, "Other Hardware"),
    ]

    PRIORITY_LOW = "Low"
    PRIORITY_MEDIUM = "Medium"
    PRIORITY_HIGH = "High"
    PRIORITY_CHOICES = [
        (PRIORITY_LOW, "Low"),
        (PRIORITY_MEDIUM, "Medium"),
        (PRIORITY_HIGH, "High"),
    ]

    STATUS_REPORTED = "Reported"
    STATUS_IN_PROGRESS = "In Progress"
    STATUS_COMPLETED = "Completed"
    STATUS_CANCELLED = "Cancelled"
    STATUS_CHOICES = [
        (STATUS_REPORTED, "Reported"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    # Server-generated, e.g. "REP-001" — see operation.codes.next_repair_id.
    repair_id = models.CharField(max_length=20, unique=True, editable=False)
    asset = models.ForeignKey(
        "assets.Asset", on_delete=models.PROTECT, related_name="repair_records"
    )
    issue_type = models.CharField(max_length=30, choices=ISSUE_TYPE_CHOICES)
    issue = models.CharField(max_length=255)
    # Repair service center — a different concept from organization.Vendor
    # (procurement distributors/publishers/marketplaces/retailers), so kept
    # as plain text rather than forced onto that FK.
    vendor = models.CharField(max_length=150)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
    under_warranty = models.BooleanField(default=False)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reported_date = models.DateField()
    expected_return_date = models.DateField()
    completed_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_REPORTED)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-reported_date", "-id"]

    def __str__(self):
        return self.repair_id


class Accessory(models.Model):
    CONDITION_GOOD = "Good"
    CONDITION_FAIR = "Fair"
    CONDITION_POOR = "Poor"
    CONDITION_CHOICES = [
        (CONDITION_GOOD, "Good"),
        (CONDITION_FAIR, "Fair"),
        (CONDITION_POOR, "Poor"),
    ]

    STATUS_ACTIVE = "Active"
    STATUS_INACTIVE = "Inactive"
    STATUS_DISCONTINUED = "Discontinued"
    ITEM_STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_INACTIVE, "Inactive"),
        (STATUS_DISCONTINUED, "Discontinued"),
    ]

    # User-editable but auto-suggested from category if left blank (see
    # operation.codes.next_accessory_sku) — matches the Add Accessory form,
    # which pre-fills a suggested SKU the user can override.
    sku = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    # Free-text category (e.g. "Mouse", "Keyboard", "Dock") — no fixed
    # Accessory category model exists; matches the Add form's free-text input.
    category = models.CharField(max_length=100)
    brand = models.CharField(max_length=100, blank=True, default="")
    model = models.CharField(max_length=150, blank=True, default="")
    description = models.TextField(blank=True, default="")
    total_qty = models.PositiveIntegerField(default=0)
    assigned_qty = models.PositiveIntegerField(default=0)
    reorder_threshold = models.PositiveIntegerField(default=0)
    reorder_qty = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    vendor = models.CharField(max_length=150, blank=True, default="")
    purchase_date = models.DateField(null=True, blank=True)
    purchase_order = models.CharField(max_length=50, blank=True, default="")
    warranty_expiry = models.DateField(null=True, blank=True)
    # Real FK to the same Location every other module uses (assets,
    # employees) — single source of truth for "where is this", unlike
    # storage_location below (a free-text shelf/rack detail *within* that
    # location, which has no dedicated model to FK to).
    location = models.ForeignKey(
        "assets.Location", null=True, blank=True, on_delete=models.SET_NULL, related_name="accessories"
    )
    storage_location = models.CharField(max_length=100, blank=True, default="")
    condition = models.CharField(max_length=10, choices=CONDITION_CHOICES, default=CONDITION_GOOD)
    item_status = models.CharField(max_length=15, choices=ITEM_STATUS_CHOICES, default=STATUS_ACTIVE)
    last_restocked = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "accessories"

    def __str__(self):
        return f"{self.sku} — {self.name}"

    @property
    def available_qty(self):
        return self.total_qty - self.assigned_qty

    @property
    def stock_status(self):
        available = self.available_qty
        if available <= 0:
            return "Out of Stock"
        if available <= self.reorder_threshold:
            return "Low Stock"
        return "In Stock"

    @property
    def stock_value(self):
        return self.total_qty * self.unit_cost


class AccessoryAssignment(models.Model):
    """One issuance of some quantity of an Accessory to an Employee — the
    accessory equivalent of operations.Assignment, but quantity-based
    rather than 1:1 (an Accessory is stock, not a single serialized unit).
    A new row is always created for each issuance, even if the employee
    already holds units of the same accessory — history (who got how many,
    when) is never overwritten in place; the "Currently Assigned" view
    sums quantity across an employee's active rows for one accessory
    instead of requiring a single merged row. Accessory.assigned_qty is
    kept in lockstep as a running total (see operation.services), the same
    way Asset.status/assigned_to shadow operations.Assignment."""

    STATUS_ASSIGNED = "Assigned"
    STATUS_RETURNED = "Returned"
    STATUS_CHOICES = [
        (STATUS_ASSIGNED, "Assigned"),
        (STATUS_RETURNED, "Returned"),
    ]

    accessory = models.ForeignKey(Accessory, on_delete=models.PROTECT, related_name="assignments")
    employee = models.ForeignKey(
        "assets.Employee", on_delete=models.PROTECT, related_name="accessory_assignments"
    )
    quantity = models.PositiveIntegerField()
    assigned_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ASSIGNED)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-assigned_date", "-id"]

    def __str__(self):
        return f"{self.accessory_id} x{self.quantity} -> {self.employee_id} ({self.status})"


class SoftwareLicense(models.Model):
    CATEGORY_PRODUCTIVITY = "Productivity"
    CATEGORY_SECURITY = "Security"
    CATEGORY_DESIGN = "Design"
    CATEGORY_DEVELOPMENT = "Development"
    CATEGORY_COMMUNICATION = "Communication"
    CATEGORY_CLOUD_STORAGE = "Cloud Storage"
    CATEGORY_OPERATING_SYSTEM = "Operating System"
    CATEGORY_OTHER = "Other"
    CATEGORY_CHOICES = [
        (CATEGORY_PRODUCTIVITY, "Productivity"),
        (CATEGORY_SECURITY, "Security"),
        (CATEGORY_DESIGN, "Design"),
        (CATEGORY_DEVELOPMENT, "Development"),
        (CATEGORY_COMMUNICATION, "Communication"),
        (CATEGORY_CLOUD_STORAGE, "Cloud Storage"),
        (CATEGORY_OPERATING_SYSTEM, "Operating System"),
        (CATEGORY_OTHER, "Other"),
    ]

    TYPE_MONTHLY = "Monthly"
    TYPE_ANNUAL = "Annual"
    TYPE_PERPETUAL = "Perpetual"
    TYPE_ONE_TIME = "One-Time"
    LICENSE_TYPE_CHOICES = [
        (TYPE_MONTHLY, "Monthly"),
        (TYPE_ANNUAL, "Annual"),
        (TYPE_PERPETUAL, "Perpetual"),
        (TYPE_ONE_TIME, "One-Time"),
    ]

    # Server-generated, e.g. "LIC-001" — see operation.codes.next_license_id.
    license_id = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=200)
    # Free-text publisher name (e.g. "Microsoft", "Adobe") — matches the Add
    # form's free-text input; no software-publisher catalog model exists.
    vendor = models.CharField(max_length=150, blank=True, default="")
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default=CATEGORY_OTHER)
    license_type = models.CharField(max_length=15, choices=LICENSE_TYPE_CHOICES)
    # User-editable but auto-generated if left blank (see
    # operation.codes.random_license_key) — matches the Add form, which
    # pre-fills a generated key the user can override.
    license_key = models.CharField(max_length=100, blank=True, default="")
    total_seats = models.PositiveIntegerField(default=1)
    seats_used = models.PositiveIntegerField(default=0)
    purchase_date = models.DateField(null=True, blank=True)
    # Null for Perpetual licenses (no expiry) — see validate_expiry_date in
    # SoftwareLicenseSerializer.
    expiry_date = models.DateField(null=True, blank=True)
    auto_renew = models.BooleanField(default=False)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.license_id} — {self.name}"

    @property
    def available_seats(self):
        return self.total_seats - self.seats_used

    @property
    def utilization_pct(self):
        return round((self.seats_used / self.total_seats) * 100, 1) if self.total_seats else 0.0

    @property
    def status(self):
        if self.license_type == self.TYPE_PERPETUAL or not self.expiry_date:
            return "Perpetual"
        from datetime import date
        days = (self.expiry_date - date.today()).days
        if days < 0:
            return "Expired"
        if days <= 30:
            return "Expiring Soon"
        return "Active"
