import datetime

from django.conf import settings
from django.db import models
from django.db.models import Case, F, Q, Value, When

from catalog.models import Brand, Category, Model

# Category/Brand/Model used to live here — they've moved to the
# catalog app (the module-level names above are re-exports) so the Catalog
# module has one real source of truth instead of duplicating them. Asset's
# FKs below point at the catalog app's versions.


class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    # Card display for the People > Departments tab — same icon/color-key
    # pattern as catalog.Category (a label the frontend maps to a Lucide
    # icon, and a palette key it maps to a Tailwind class set). Neither is
    # interpreted server-side; both are free-form and optional so existing
    # rows don't need a value.
    icon_label = models.CharField(max_length=50, blank=True, default="")
    color_key = models.CharField(max_length=30, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Location(models.Model):
    TYPE_HEADQUARTERS = "headquarters"
    TYPE_BRANCH_OFFICE = "branch_office"
    TYPE_REMOTE = "remote"
    TYPE_CHOICES = [
        (TYPE_HEADQUARTERS, "Headquarters"),
        (TYPE_BRANCH_OFFICE, "Branch Office"),
        (TYPE_REMOTE, "Remote"),
    ]

    name = models.CharField(max_length=100, unique=True)
    # Called `location_type` in the Add Location spec — kept as `type` here
    # since that's the field name already live across this codebase
    # (LocationFilter, organization.LocationSerializer, the CSV importer's
    # Location.objects.get_or_create, and the Locations page's own mock
    # data). Renaming it would touch all of those for a naming preference
    # alone; the choices/behavior are otherwise exactly what was asked for.
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_HEADQUARTERS)
    address = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class EmployeeManager(models.Manager):
    def find_by_name(self, raw_name):
        """Case/whitespace-insensitive name match — the one place that
        decides whether two names refer to the same Employee. Shared by the
        Add Asset form's free-text assignee resolution
        (AssetWriteSerializer._resolve_assigned_to) and the Organization
        module's own duplicate-name check (EmployeeSerializer.validate_name),
        so the two entry points can't quietly drift into different
        definitions of "is this the same person" and end up with two rows
        for one name."""
        normalized = (raw_name or "").strip()
        if not normalized:
            return None
        return self.filter(name__iexact=normalized).first()


class Employee(models.Model):
    """An employee an asset can be assigned to. Deliberately NOT auth.User —
    assignees aren't necessarily system login accounts.

    Named Employee (was Person until a deliberate rename) — see
    assets/migrations/<rename migration> for the RenameModel migration this
    went through; the table's data was preserved, nothing was dropped/recreated.

    status (active/inactive) is deliberately NOT a separate field — it's
    just `is_active` exposed as a two-value string by the Organization
    module's serializer (see organization.serializers.EmployeeSerializer), so
    there's one source of truth instead of two fields that could drift apart."""
    employee_id = models.CharField(
        max_length=20, unique=True, null=True, blank=True,
        help_text="Server-generated, e.g. 'EMP-1001' — see organization.codes.next_employee_id.",
    )
    name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True, default="")
    designation = models.CharField(max_length=100, blank=True, default="")
    department = models.ForeignKey(
        Department, null=True, blank=True, on_delete=models.SET_NULL, related_name="employees"
    )
    location = models.ForeignKey(
        Location, null=True, blank=True, on_delete=models.SET_NULL, related_name="employees"
    )
    is_active = models.BooleanField(default=True)
    # The login account this employee signs in with, if any. Nullable: many
    # assignees never log in. One-to-one, so a user is at most one employee.
    # Linked explicitly by an administrator (never matched by email —
    # Employee.email isn't unique); SET_NULL keeps the employee and their
    # asset history if the account is deleted.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="employee"
    )

    objects = EmployeeManager()

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "people"

    def __str__(self):
        return self.name

    @property
    def initials(self):
        parts = self.name.split()
        return "".join(p[0] for p in parts[:2]).upper()


class Asset(models.Model):
    STATUS_ASSIGNED = "Assigned"
    STATUS_AVAILABLE = "Available"
    STATUS_IN_REPAIR = "In Repair"
    STATUS_RESERVED = "Reserved"
    STATUS_MAINTENANCE = "Maintenance"
    STATUS_CHOICES = [
        (STATUS_ASSIGNED, "Assigned"),
        (STATUS_AVAILABLE, "Available"),
        (STATUS_IN_REPAIR, "In Repair"),
        (STATUS_RESERVED, "Reserved"),
        (STATUS_MAINTENANCE, "Maintenance"),
    ]

    CONDITION_GOOD = "Good"
    CONDITION_FAIR = "Fair"
    CONDITION_POOR = "Poor"
    CONDITION_CHOICES = [
        (CONDITION_GOOD, "Good"),
        (CONDITION_FAIR, "Fair"),
        (CONDITION_POOR, "Poor"),
    ]

    WARRANTY_ACTIVE = "Active"
    WARRANTY_EXPIRING = "Expiring"
    WARRANTY_EXPIRED = "Expired"
    WARRANTY_CHOICES = [
        (WARRANTY_ACTIVE, "Active"),
        (WARRANTY_EXPIRING, "Expiring"),
        (WARRANTY_EXPIRED, "Expired"),
    ]

    asset_code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="assets")
    brand = models.ForeignKey(
        Brand, null=True, blank=True, on_delete=models.PROTECT, related_name="assets",
    )
    model = models.ForeignKey(
        Model, null=True, blank=True, on_delete=models.PROTECT, related_name="assets",
        help_text="Catalog model this asset is a unit of, e.g. \"MacBook Pro 14\".",
    )
    serial_number = models.CharField(max_length=100, unique=True)
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="assets")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="assets")
    assigned_to = models.ForeignKey(
        Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_assets"
    )
    # String reference, not a direct import — organization.Vendor lives in a
    # separate app and this keeps assets/organization free of a circular
    # import between the two apps' models.py.
    vendor = models.ForeignKey(
        "organization.Vendor", null=True, blank=True, on_delete=models.SET_NULL, related_name="assets",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_AVAILABLE)
    condition = models.CharField(max_length=10, choices=CONDITION_CHOICES, default=CONDITION_GOOD)
    cost = models.DecimalField(max_digits=12, decimal_places=2, help_text="Original purchase cost.")
    current_value = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Present-day valuation, used for the Catalog module's per-category/brand/model "
                   "'current asset value' stat. Defaults to cost when left blank.",
    )
    # Days before warranty_end_date at which a warranty counts as "Expiring".
    WARRANTY_EXPIRING_DAYS = 90

    # Stored status. When warranty_end_date is set, save() derives this from
    # the date (see warranty_status_for) and every reader that filters on it
    # should use Asset.warranty_q() so the result can't go stale as days pass.
    # Assets with no end date on file keep the manually entered value.
    warranty_status = models.CharField(max_length=10, choices=WARRANTY_CHOICES, default=WARRANTY_ACTIVE)
    warranty_start_date = models.DateField(null=True, blank=True)
    warranty_end_date = models.DateField(null=True, blank=True)
    warranty_provider = models.CharField(max_length=150, blank=True, default="")
    purchase_date = models.DateField(
        null=True, blank=True,
        help_text=(
            "Date the asset was originally purchased. Used by Reports for the "
            "12-month acquisition trend. Nullable so existing records are unaffected."
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.asset_code} — {self.name}"

    @classmethod
    def warranty_status_for(cls, end_date, today=None):
        """Active / Expiring / Expired for a warranty ending on end_date."""
        today = today or datetime.date.today()
        days_left = (end_date - today).days
        if days_left < 0:
            return cls.WARRANTY_EXPIRED
        if days_left <= cls.WARRANTY_EXPIRING_DAYS:
            return cls.WARRANTY_EXPIRING
        return cls.WARRANTY_ACTIVE

    @classmethod
    def warranty_q(cls, status, today=None):
        """Q matching assets whose *current* warranty status is `status`:
        derived from warranty_end_date when one is on file, otherwise the
        stored warranty_status."""
        today = today or datetime.date.today()
        expiring_from = today + datetime.timedelta(days=cls.WARRANTY_EXPIRING_DAYS)
        by_date = {
            cls.WARRANTY_EXPIRED: Q(warranty_end_date__lt=today),
            cls.WARRANTY_EXPIRING: Q(warranty_end_date__gte=today, warranty_end_date__lte=expiring_from),
            cls.WARRANTY_ACTIVE: Q(warranty_end_date__gt=expiring_from),
        }[status]
        return by_date | Q(warranty_end_date__isnull=True, warranty_status=status)

    @classmethod
    def live_warranty_status_expression(cls, today=None):
        """SQL expression for the *current* warranty status — the same rule
        as warranty_status_for()/warranty_q(), evaluated in the query, so
        sorting can't use a stale stored value."""
        today = today or datetime.date.today()
        expiring_until = today + datetime.timedelta(days=cls.WARRANTY_EXPIRING_DAYS)
        return Case(
            When(warranty_end_date__isnull=True, then=F("warranty_status")),
            When(warranty_end_date__lt=today, then=Value(cls.WARRANTY_EXPIRED)),
            When(warranty_end_date__lte=expiring_until, then=Value(cls.WARRANTY_EXPIRING)),
            default=Value(cls.WARRANTY_ACTIVE),
            output_field=models.CharField(),
        )

    @property
    def current_warranty_status(self):
        if self.warranty_end_date:
            return self.warranty_status_for(self.warranty_end_date)
        return self.warranty_status

    @property
    def warranty_days_remaining(self):
        if not self.warranty_end_date:
            return None
        return (self.warranty_end_date - datetime.date.today()).days

    def save(self, *args, **kwargs):
        if self.current_value is None:
            self.current_value = self.cost
        if self.warranty_end_date:
            self.warranty_status = self.warranty_status_for(self.warranty_end_date)
        super().save(*args, **kwargs)
