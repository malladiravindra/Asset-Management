from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework import serializers

from accounts.fields import IndianPhoneField, NormalizedEmailField
from assets.models import Department, Location, Employee

from .codes import next_employee_id, next_vendor_code
from .models import Vendor


class ActiveStatusField(serializers.ChoiceField):
    """active/inactive <-> Employee.is_active bridge. There's deliberately no
    separate `status` column on Employee (see its docstring in
    assets/models.py) — this field reads/writes the existing boolean so
    the Organization module's "status" and the Add Asset form's assignee
    flow can never see two different values for the same employee."""

    def __init__(self, **kwargs):
        kwargs.setdefault("choices", [("active", "Active"), ("inactive", "Inactive")])
        super().__init__(**kwargs)

    def to_representation(self, value):
        return "active" if value else "inactive"

    def to_internal_value(self, data):
        return super().to_internal_value(data) == "active"


class EmployeeSerializer(serializers.ModelSerializer):
    """Read AND write shape for Organization > Employees. asset_count comes
    from the view's annotate(Count("assigned_assets")) (single relation, no
    fan-out risk — see organization.views.annotated_employees). department_name/
    location_name are read-only echoes of the FKs' names so the frontend
    doesn't need a second lookup call. employee_id is server-generated
    (e.g. "EMP-1004"), never accepted from the client."""

    asset_count = serializers.IntegerField(read_only=True, default=0)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    location_name = serializers.CharField(source="location.name", read_only=True, default=None)
    initials = serializers.CharField(read_only=True)
    status = ActiveStatusField(source="is_active", required=False)
    # Declared explicitly (not left to ModelSerializer's auto-generation)
    # so every email/phone field in the project goes through the same
    # shared normalization — see accounts/fields.py. required/allow_blank
    # moved here from Meta.extra_kwargs since an explicitly declared field
    # takes those kwargs directly instead.
    email = NormalizedEmailField(required=True, allow_blank=False)
    phone = IndianPhoneField(required=True, allow_blank=False)
    # The login account linked to this employee (assets.Employee.user).
    # Optional; changing it needs auth.change_user (see validate_user).
    user = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.all(), required=False, allow_null=True
    )
    user_username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = Employee
        fields = [
            "id", "employee_id", "name", "designation", "department", "department_name",
            "location", "location_name", "email", "phone", "status", "initials", "asset_count",
            "user", "user_username",
        ]
        read_only_fields = ["id", "employee_id"]
        # Required/optional split matches the Add Employee modal's spec
        # exactly: name*, location*, email*, phone* required; department,
        # designation, status optional. All four have a model-level
        # blank/null default (see assets.models.Employee), which makes DRF
        # auto-relax `required` to False — overridden back to True here for
        # the starred fields only. name has no model-level blank=True, so
        # it's already required (and already rejects "") with no override
        # needed. email/phone are handled by their explicit field
        # declarations above instead of extra_kwargs.
        extra_kwargs = {
            "location": {"required": True},
        }

    def validate_name(self, value):
        value = value.strip()
        existing = Employee.objects.find_by_name(value)
        if existing is not None and (self.instance is None or existing.pk != self.instance.pk):
            raise serializers.ValidationError("An employee with this name already exists.")
        return value

    def validate_user(self, value):
        current = self.instance.user if self.instance is not None else None
        if value == current:
            return value
        # Linking an employee to a login account decides whose profile a
        # user sees and edits — identity administration, not HR data entry.
        request = self.context.get("request")
        if request is None or not request.user.has_perm("auth.change_user"):
            raise serializers.ValidationError("You don't have permission to link employees to user accounts.")
        if value is not None:
            linked = Employee.objects.filter(user=value)
            if self.instance is not None:
                linked = linked.exclude(pk=self.instance.pk)
            if linked.exists():
                raise serializers.ValidationError("This user account is already linked to another employee.")
        return value

    def validate_email(self, value):
        # `value` has already been trimmed + lowercased by
        # NormalizedEmailField.to_internal_value by the time this runs —
        # this only needs to check uniqueness.
        qs = Employee.objects.filter(email__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("An employee with this email already exists.")
        return value

    def create(self, validated_data):
        # Retry a few times in case of a race on the generated id (two
        # near-simultaneous creates) — same approach as
        # AssetWriteSerializer.create's asset_code generation.
        last_error = None
        for _ in range(5):
            validated_data["employee_id"] = next_employee_id()
            try:
                with transaction.atomic():
                    return super().create(validated_data)
            except IntegrityError as exc:
                last_error = exc
                continue
        raise serializers.ValidationError(
            {"employee_id": "Could not generate a unique employee id — please retry."}
        ) from last_error


class DepartmentSerializer(serializers.ModelSerializer):
    """Organization > Departments tab. employee_count/asset_count come from the
    view's annotate() (see organization.views.annotated_departments) —
    not stored, default to 0 on a plain (unannotated) instance.
    percent_of_fleet is share of the total ASSET COUNT across every
    department (same basis as catalog.CategorySerializer's
    percent_of_fleet — Location/Vendor use an asset-VALUE basis instead,
    see their own docstrings for why), from serializer context.

    name is declared explicitly (not left to ModelSerializer's
    auto-generation) so DRF does NOT attach its own UniqueValidator, which
    — being a *field*-level validator — runs before validate_name() below
    and would otherwise intercept exact-case duplicates with its own
    default wording, leaving validate_name() to only ever catch
    case-*different* duplicates (same reasoning as
    catalog.CategorySerializer.name). validate_name() below is the single
    source of truth for every duplicate, exact-case included, and for the
    required-field message."""

    employee_count = serializers.IntegerField(read_only=True, default=0)
    asset_count = serializers.IntegerField(read_only=True, default=0)
    percent_of_fleet = serializers.SerializerMethodField()
    name = serializers.CharField(max_length=100)

    class Meta:
        model = Department
        fields = [
            "id", "name", "icon_label", "color_key",
            "employee_count", "asset_count", "percent_of_fleet", "created_at",
        ]
        read_only_fields = ["id", "created_at"]
        # icon_label/color_key have a model-level blank=True default (see
        # assets.models.Department), which makes DRF auto-relax `required`
        # to False. That's intentional here, unlike Location's `type` or
        # Employee's `location` — the Add Department modal always sends a
        # value (it defaults to the first icon/color client-side), but
        # per spec neither is mandatory, so a request that omits either
        # still succeeds and falls back to the model's "" default.

    def get_percent_of_fleet(self, obj):
        total = self.context.get("total_assets") or 0
        count = getattr(obj, "asset_count", 0) or 0
        if not total:
            return 0.0
        return round((count / total) * 100, 1)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("This field is required.")
        qs = Department.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A department with this name already exists.")
        return value


class LocationSerializer(serializers.ModelSerializer):
    """Locations page. asset_count/employee_count/current_asset_value/
    in_repair_count come from the view's annotate() (see
    organization.views.annotated_locations) — not stored, default to 0 on
    a plain instance. percent_of_fleet needs the fleet-wide asset VALUE
    total, which isn't something a single row's query can know — it's
    computed from serializer context, same pattern as
    VendorSerializer.get_spend_percentage below (was asset-COUNT-based as
    `fleet_percentage` before; renamed + switched to value-based to match
    the "current_asset_value ÷ sum of current_asset_value" spec)."""

    asset_count = serializers.IntegerField(read_only=True, default=0)
    employee_count = serializers.IntegerField(read_only=True, default=0)
    current_asset_value = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True, default=Decimal("0")
    )
    in_repair_count = serializers.IntegerField(read_only=True, default=0)
    percent_of_fleet = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = [
            "id", "name", "type", "address",
            "asset_count", "employee_count", "current_asset_value",
            "percent_of_fleet", "in_repair_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        # type has a model-level default, which makes DRF auto-relax
        # `required` to False — override that back to True since the Add
        # Location form always submits one (defaults to the first option).
        extra_kwargs = {"type": {"required": True}}

    def get_percent_of_fleet(self, obj):
        total_value = self.context.get("total_fleet_value") or Decimal("0")
        value = getattr(obj, "current_asset_value", None) or Decimal("0")
        if not total_value:
            return 0.0
        return round(float(value / total_value) * 100, 1)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("This field is required.")
        qs = Location.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A location with this name already exists.")
        return value


class CapitalizedStatusField(serializers.Field):
    def to_representation(self, value):
        return "Active" if value == Vendor.STATUS_ACTIVE else "Inactive"

    def to_internal_value(self, data):
        if not data:
            return Vendor.STATUS_ACTIVE
        val_lower = str(data).strip().lower()
        if val_lower in [Vendor.STATUS_ACTIVE, Vendor.STATUS_INACTIVE]:
            return val_lower
        raise serializers.ValidationError("Choose one of: Active, Inactive")


class VendorSerializer(serializers.ModelSerializer):
    """Vendors page. asset_count/total_spend/avg_cost come from the view's
    annotate() — all three aggregate the SAME relation (assets), so a
    plain joined annotate() is safe here, no fan-out risk (unlike
    Location's asset_count+employee_count, which span two relations —
    see organization.utils.subquery_count). spend_percentage needs the
    total spend across every vendor, from serializer context — same
    pattern as Location's fleet_percentage."""

    asset_count = serializers.IntegerField(read_only=True, default=0)
    total_spend = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True, default=Decimal("0")
    )
    avg_cost = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True, default=Decimal("0")
    )
    spend_percentage = serializers.SerializerMethodField()
    # Declared explicitly as a plain CharField (not left to ModelSerializer's
    # auto ChoiceField mapping) so validate_vendor_type below actually gets
    # a chance to run its own message — DRF's auto-generated ChoiceField
    # would otherwise reject an invalid value at the field-validation stage,
    # before validate_vendor_type ever runs, with its generic
    # "\"x\" is not a valid choice." error instead of ours.
    vendor_type = serializers.CharField(required=True)
    type = serializers.SerializerMethodField()
    status = CapitalizedStatusField(required=False)
    # Same shared normalization as Employee's email/phone (see
    # accounts/fields.py) — phone stays optional (Vendor.phone is
    # blank=True), the field just normalizes it when one is provided.
    email = NormalizedEmailField(required=True, allow_blank=False)
    phone = IndianPhoneField(required=False, allow_blank=True)

    class Meta:
        model = Vendor
        fields = [
            "id", "name", "email", "phone", "vendor_type", "type", "status",
            # Business info / address / procurement / notes — previously
            # frontend-only ("not saved" in the Add/Edit Vendor form); now
            # real columns (see organization.models.Vendor), all optional.
            "company_name", "contact_person", "vendor_code", "gst_number",
            "address", "city", "state", "country", "postal_code",
            "payment_terms", "currency", "notes",
            "asset_count", "total_spend", "avg_cost", "spend_percentage",
            "created_at", "updated_at",
        ]
        # vendor_code is server-generated (organization.codes.next_vendor_code).
        read_only_fields = ["id", "vendor_code", "created_at", "updated_at"]
        extra_kwargs = {
            "name": {"required": True, "allow_blank": False},
        }

    def create(self, validated_data):
        # Retry in case two creates race on the same generated code.
        last_error = None
        for _ in range(5):
            validated_data["vendor_code"] = next_vendor_code()
            try:
                with transaction.atomic():
                    return super().create(validated_data)
            except IntegrityError as exc:
                last_error = exc
        raise serializers.ValidationError(
            {"vendor_code": "Could not generate a unique vendor code — please retry."}
        ) from last_error

    def get_type(self, obj):
        choices = dict(Vendor.VENDOR_TYPE_CHOICES)
        return choices.get(obj.vendor_type, obj.vendor_type)

    def get_spend_percentage(self, obj):
        total = self.context.get("total_spend") or Decimal("0")
        spend = getattr(obj, "total_spend", None) or Decimal("0")
        if not total:
            return 0.0
        return round(float(spend / total) * 100, 1)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("This field is required.")
        qs = Vendor.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A vendor with this name already exists.")
        return value

    def validate_email(self, value):
        # `value` has already been trimmed + lowercased by
        # NormalizedEmailField.to_internal_value, and required/allow_blank
        # is already enforced by the field itself — this only needs to
        # check uniqueness.
        qs = Vendor.objects.filter(email__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A vendor with this email already exists.")
        return value

    def validate_vendor_type(self, value):
        val_lower = str(value).strip().lower().replace(" ", "_")
        valid_values = dict(Vendor.VENDOR_TYPE_CHOICES)
        if val_lower in valid_values:
            return val_lower
        for key, label in Vendor.VENDOR_TYPE_CHOICES:
            if label.strip().lower() == str(value).strip().lower():
                return key
        raise serializers.ValidationError(
            f"\"{value}\" is not a valid vendor type. Choose one of: "
            + ", ".join(valid_values.keys())
        )

    def to_internal_value(self, data):
        if "type" in data and "vendor_type" not in data:
            data = data.copy()
            data["vendor_type"] = data["type"]
        return super().to_internal_value(data)
