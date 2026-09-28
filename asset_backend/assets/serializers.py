import re

from django.db import IntegrityError, transaction
from rest_framework import serializers

from catalog.models import Brand, Category, Model
from organization.models import Vendor

from .codes import next_asset_code
from .models import Asset, Department, Location, Employee

# 2-letter brand code + 6-10 digits, e.g. "DL123456789" (Dell), "HP123456789"
# (HP), "LN123456789" (Lenovo). Used by AssetWriteSerializer.validate_serial_number
# below — applies to both create (POST) and update (PATCH/PUT), since both
# go through the same serializer. Deliberately NOT enforced at the model
# level (no RegexValidator on Asset.serial_number) — the 63 already-seeded
# assets predate this format and are left as-is (see that method's
# docstring); only new writes through this serializer are checked.
SERIAL_NUMBER_PATTERN = re.compile(r"^[A-Z]{2}\d{6,10}$")

class EmployeeMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ["id", "name", "initials"]


class AssetSerializer(serializers.ModelSerializer):
    """Read shape — used for list/retrieve. FKs resolve to plain name strings
    (category/brand/model/department/location) except assigned_to, which is
    nested {id, name, initials} so the table can render an avatar without a
    second lookup call."""

    category = serializers.SlugRelatedField(slug_field="name", read_only=True)
    brand = serializers.SlugRelatedField(slug_field="name", read_only=True)
    model = serializers.SlugRelatedField(slug_field="name", read_only=True)
    department = serializers.SlugRelatedField(slug_field="name", read_only=True)
    location = serializers.SlugRelatedField(slug_field="name", read_only=True)
    vendor = serializers.SlugRelatedField(slug_field="name", read_only=True)
    assigned_to = EmployeeMiniSerializer(read_only=True)
    # Derived from warranty_end_date when one is on file (see
    # Asset.current_warranty_status), so it never goes stale.
    warranty_status = serializers.CharField(source="current_warranty_status", read_only=True)
    warranty_days_remaining = serializers.IntegerField(read_only=True)

    class Meta:
        model = Asset
        fields = [
            "id",
            "asset_code",
            "name",
            "category",
            "brand",
            "model",
            "serial_number",
            "department",
            "location",
            "vendor",
            "assigned_to",
            "status",
            "condition",
            "cost",
            "current_value",
            "warranty_status",
            "warranty_start_date",
            "warranty_end_date",
            "warranty_provider",
            "warranty_days_remaining",
            "purchase_date",
            "created_at",
            "updated_at",
        ]


class AssetWriteSerializer(serializers.ModelSerializer):
    """Create/update shape — FKs by id. Used for POST/PUT/PATCH; the
    response is re-serialized through AssetSerializer by the viewset.

    asset_code is server-generated (e.g. "AF-LT-0005") and NOT accepted
    from the client — see read_only_fields below and create().
    """

    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        error_messages={
            "does_not_exist": "Invalid category id.",
            "incorrect_type": "category id must be a number.",
        },
    )
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        error_messages={
            "does_not_exist": "Invalid department id.",
            "incorrect_type": "department id must be a number.",
        },
    )
    location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(),
        error_messages={
            "does_not_exist": "Invalid location id.",
            "incorrect_type": "location id must be a number.",
        },
    )
    brand = serializers.PrimaryKeyRelatedField(
        queryset=Brand.objects.all(), required=False, allow_null=True,
        error_messages={
            "does_not_exist": "Invalid brand id.",
            "incorrect_type": "brand id must be a number.",
        },
    )
    model = serializers.PrimaryKeyRelatedField(
        queryset=Model.objects.all(), required=False, allow_null=True,
        error_messages={
            "does_not_exist": "Invalid model id.",
            "incorrect_type": "model id must be a number.",
        },
    )
    vendor = serializers.PrimaryKeyRelatedField(
        queryset=Vendor.objects.all(), required=False, allow_null=True,
        error_messages={
            "does_not_exist": "Invalid vendor id.",
            "incorrect_type": "vendor id must be a number.",
        },
    )
    # Free-text employee name, NOT an Employee id — the frontend field is a
    # plain text input, not an id-based dropdown. Resolved to an actual
    # Employee via _resolve_assigned_to() in create()/update() below, which
    # looks up case/whitespace-insensitively and auto-creates one if no
    # match exists ("Rohit Verma" and "rohit verma " both resolve to the
    # same Employee, whichever was typed first sets the stored casing).
    assigned_to = serializers.CharField(
        required=False, allow_blank=True, allow_null=True,
        help_text=(
            "Employee name. Looked up case/whitespace-insensitively; a "
            "new Employee is created automatically if no match exists. "
            "Omit, or send blank/null, for Unassigned."
        ),
    )

    class Meta:
        model = Asset
        fields = [
            "id",
            "asset_code",
            "name",
            "category",
            "brand",
            "model",
            "serial_number",
            "department",
            "location",
            "vendor",
            "assigned_to",
            "status",
            "condition",
            "cost",
            "current_value",
            "warranty_status",
            "warranty_start_date",
            "warranty_end_date",
            "warranty_provider",
            "purchase_date",
        ]
        read_only_fields = ["id", "asset_code"]
        # status/condition have a model-level `default=`, which makes DRF
        # auto-relax `required` to False (it assumes the default is fine to
        # fall back on) — override that back to True so omitting them from a
        # POST is a 400, not a silent default. warranty_status is required
        # only when no warranty_end_date is sent — see validate().
        extra_kwargs = {
            "name": {"required": True, "allow_blank": False},
            "serial_number": {"required": True, "allow_blank": False},
            "status": {"required": True},
            "condition": {"required": True},
            "cost": {"required": True},
        }

    def validate_name(self, value):
        val = (value or "").strip()
        if not val:
            raise serializers.ValidationError("Asset name cannot be blank.")
        return val

    def validate_cost(self, value):
        if value <= 0:
            raise serializers.ValidationError("Cost must be a positive number.")
        return value

    def validate_warranty_provider(self, value):
        return (value or "").strip()

    def validate(self, attrs):
        """Warranty dates are the source of truth for warranty status:
        when an end date is on file, Asset.save() derives the status from
        it and any client-sent warranty_status is ignored. Without one, the
        manually chosen status is required (on create) and kept."""
        start = attrs.get("warranty_start_date", getattr(self.instance, "warranty_start_date", None))
        end = attrs.get("warranty_end_date", getattr(self.instance, "warranty_end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"warranty_end_date": "Warranty end date can't be before the warranty start date."}
            )
        if self.instance is None and not end and not attrs.get("warranty_status"):
            raise serializers.ValidationError(
                {"warranty_status": "Provide a warranty end date or a warranty status."}
            )
        return attrs

    def validate_serial_number(self, value):
        """Format check only — the model field's own `unique=True` already
        gives ModelSerializer an auto-attached UniqueValidator on this same
        field, which runs first (field-level validators run before this
        object-level validate_<field> method) and is left untouched. This
        just adds the format rule on top, applying identically whether the
        request is a POST (create) or a PATCH/PUT (update), since both
        route through this one serializer."""
        normalized = (value or "").strip().upper()
        if not SERIAL_NUMBER_PATTERN.match(normalized):
            raise serializers.ValidationError(
                "Serial number must follow the format: 2 letters (brand code) + digits, e.g. DL123456789."
            )
        return normalized

    def _resolve_assigned_to(self, validated_data):
        """Pop the raw assigned_to name out of validated_data and replace
        it with an actual Employee instance (or None), creating one if no
        case/whitespace-insensitive match exists. No-ops if the key isn't
        present at all, so a partial update that doesn't touch this field
        leaves the existing assignment untouched."""
        if "assigned_to" not in validated_data:
            return
        raw_name = validated_data.pop("assigned_to")
        normalized = (raw_name or "").strip()
        if not normalized:
            validated_data["assigned_to"] = None
            return
        validated_data["assigned_to"] = (
            Employee.objects.find_by_name(normalized) or Employee.objects.create(name=normalized)
        )

    def create(self, validated_data):
        self._resolve_assigned_to(validated_data)
        category = validated_data["category"]
        # Retry a few times in case of a race on the generated code (two
        # near-simultaneous creates in the same category).
        last_error = None
        for _ in range(5):
            validated_data["asset_code"] = next_asset_code(category)
            try:
                with transaction.atomic():
                    return super().create(validated_data)
            except IntegrityError as exc:
                last_error = exc
                continue
        raise serializers.ValidationError(
            {"asset_code": "Could not generate a unique asset code — please retry."}
        ) from last_error

    def update(self, instance, validated_data):
        self._resolve_assigned_to(validated_data)
        return super().update(instance, validated_data)
