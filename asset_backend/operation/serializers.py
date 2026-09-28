import datetime

from django.db import IntegrityError, OperationalError, transaction
from rest_framework import serializers

from assets.models import Asset, Location
from system_settings.services import get_system_settings

from . import services
from .codes import next_accessory_sku, next_license_id, next_repair_id, random_license_key
from .models import Accessory, AccessoryAssignment, MaintenanceRecord, RepairRecord, SoftwareLicense


def _default_completed_date(attrs, instance, completed_status):
    """Stamp completed_date with today when a record moves to Completed
    without one (the client normally sends its local date)."""
    if (
        attrs.get("status") == completed_status
        and not attrs.get("completed_date")
        and not getattr(instance, "completed_date", None)
    ):
        attrs["completed_date"] = datetime.date.today()


class MaintenanceRecordSerializer(serializers.ModelSerializer):
    """Read AND write shape. `asset` is accepted/returned by id; asset_tag/
    asset_name/category/location are read-only echoes derived live from the
    FK (see MaintenanceRecord's docstring) — never stored redundantly, so
    they can't drift if the asset is later renamed/moved."""

    asset_tag = serializers.CharField(source="asset.asset_code", read_only=True)
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    category = serializers.CharField(source="asset.category.name", read_only=True)
    location = serializers.CharField(source="asset.location.name", read_only=True)
    # Computed, not stored — the "Overdue" variant of `status` used by the
    # frontend's own displayStatus() (see components/maintenance/data.ts),
    # now also available from the backend so both sides agree on it.
    display_status = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceRecord
        fields = [
            "id", "asset", "asset_tag", "asset_name", "category", "location",
            "type", "technician", "priority", "scheduled_date", "completed_date",
            "status", "display_status", "cost", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_display_status(self, obj):
        import datetime
        is_open = obj.status in (MaintenanceRecord.STATUS_SCHEDULED, MaintenanceRecord.STATUS_IN_PROGRESS)
        if is_open and obj.scheduled_date < datetime.date.today():
            return "Overdue"
        return obj.status

    def validate_cost(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Cost cannot be negative.")
        return value

    def validate(self, attrs):
        """Settings > Maintenance: Allow Preventive Maintenance / Allow
        Maintenance Scheduling. Only checked for values being written, so
        existing records stay editable."""
        s = get_system_settings()
        if (
            not s.allow_preventive_maintenance
            and attrs.get("type") == MaintenanceRecord.TYPE_PREVENTIVE
            and (self.instance is None or self.instance.type != MaintenanceRecord.TYPE_PREVENTIVE)
        ):
            raise serializers.ValidationError({"type": "Preventive maintenance is disabled in Settings."})
        scheduled = attrs.get("scheduled_date")
        if (
            not s.allow_maintenance_scheduling
            and scheduled
            and scheduled > datetime.date.today()
            and (self.instance is None or self.instance.scheduled_date != scheduled)
        ):
            raise serializers.ValidationError(
                {"scheduled_date": "Scheduling maintenance for a future date is disabled in Settings."}
            )
        _default_completed_date(attrs, self.instance, MaintenanceRecord.STATUS_COMPLETED)
        return attrs

    def create(self, validated_data):
        # Settings > Maintenance > Default Maintenance Status, used when the
        # client doesn't send a status (the Add Maintenance form never does).
        validated_data.setdefault("status", get_system_settings().default_maintenance_status)
        return super().create(validated_data)


class RepairRecordSerializer(serializers.ModelSerializer):
    """Read AND write shape. repair_id is server-generated (e.g. "REP-027")
    and never accepted from the client. asset_tag/asset_name/category/
    location mirror MaintenanceRecordSerializer's — read-only, derived live
    from the `asset` FK."""

    asset_tag = serializers.CharField(source="asset.asset_code", read_only=True)
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    category = serializers.CharField(source="asset.category.name", read_only=True)
    location = serializers.CharField(source="asset.location.name", read_only=True)
    display_status = serializers.SerializerMethodField()

    class Meta:
        model = RepairRecord
        fields = [
            "id", "repair_id", "asset", "asset_tag", "asset_name", "category", "location",
            "issue_type", "issue", "vendor", "priority", "under_warranty", "cost",
            "reported_date", "expected_return_date", "completed_date", "status",
            "display_status", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "repair_id", "created_at", "updated_at"]

    def get_display_status(self, obj):
        import datetime
        is_open = obj.status in (RepairRecord.STATUS_REPORTED, RepairRecord.STATUS_IN_PROGRESS)
        if is_open and obj.expected_return_date < datetime.date.today():
            return "Overdue"
        return obj.status

    def validate_cost(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Cost cannot be negative.")
        return value

    def validate(self, attrs):
        reported = attrs.get("reported_date", getattr(self.instance, "reported_date", None))
        expected = attrs.get("expected_return_date", getattr(self.instance, "expected_return_date", None))
        if reported and expected and expected < reported:
            raise serializers.ValidationError(
                {"expected_return_date": "Expected return date can't be before the reported date."}
            )
        # Settings > Repairs > Require Repair Cost. A repair covered by the
        # asset's warranty legitimately costs nothing, so it is exempt.
        under_warranty = attrs.get("under_warranty", getattr(self.instance, "under_warranty", False))
        if get_system_settings().require_repair_cost and not under_warranty:
            cost = attrs.get("cost", getattr(self.instance, "cost", None))
            if cost is None or cost <= 0:
                raise serializers.ValidationError({"cost": "Repair cost is required (Settings > Repairs)."})
        _default_completed_date(attrs, self.instance, RepairRecord.STATUS_COMPLETED)
        return attrs

    def create(self, validated_data):
        # Settings > Repairs > Default Repair Status, used when the client
        # doesn't send a status (the Add Repair form never does).
        validated_data.setdefault("status", get_system_settings().default_repair_status)
        last_error = None
        for _ in range(5):
            validated_data["repair_id"] = next_repair_id()
            try:
                with transaction.atomic():
                    return super().create(validated_data)
            except IntegrityError as exc:
                last_error = exc
                continue
        raise serializers.ValidationError(
            {"repair_id": "Could not generate a unique repair id — please retry."}
        ) from last_error


class AccessorySerializer(serializers.ModelSerializer):
    """Read AND write shape. sku is accepted from the client but falls back
    to a server-generated default (e.g. "MS-004") when left blank — matches
    the Add Accessory form, which pre-fills a suggested SKU the user can
    override. location is a real FK (id in, name echoed back read-only);
    storage_location stays plain text (shelf/rack detail, no model to FK
    to). available_qty/stock_status/stock_value are computed, not stored."""

    location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), required=False, allow_null=True,
        error_messages={"does_not_exist": "Invalid location id.", "incorrect_type": "location id must be a number."},
    )
    location_name = serializers.CharField(source="location.name", read_only=True, default=None)
    available_qty = serializers.IntegerField(read_only=True)
    stock_status = serializers.CharField(read_only=True)
    stock_value = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Accessory
        fields = [
            "id", "sku", "name", "category", "brand", "model", "description",
            "total_qty", "assigned_qty", "reorder_threshold", "reorder_qty", "unit_cost",
            "vendor", "purchase_date", "purchase_order", "warranty_expiry",
            "location", "location_name", "storage_location", "condition", "item_status",
            "last_restocked", "available_qty", "stock_status", "stock_value",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"sku": {"required": False, "allow_blank": True}}

    def validate_sku(self, value):
        value = value.strip()
        if not value:
            return value  # filled in by create()/update() below.
        qs = Accessory.objects.filter(sku__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("An accessory with this SKU already exists.")
        return value

    def validate(self, attrs):
        total_qty = attrs.get("total_qty", getattr(self.instance, "total_qty", 0))
        assigned_qty = attrs.get("assigned_qty", getattr(self.instance, "assigned_qty", 0))
        if assigned_qty > total_qty:
            raise serializers.ValidationError(
                {"assigned_qty": "Assigned quantity can't exceed total quantity."}
            )
        return attrs

    def create(self, validated_data):
        if not validated_data.get("sku"):
            validated_data["sku"] = next_accessory_sku(validated_data.get("category", ""))
        return super().create(validated_data)


class AccessoryAssignmentSerializer(serializers.ModelSerializer):
    """Read AND write shape. accessory/employee are accepted and returned by
    id (matches the Assign Accessory modal, which submits ids); accessory_
    sku/accessory_name/employee_name/department/location are read-only,
    derived live from those two relations — never stored redundantly, same
    pattern as AssignmentSerializer for asset assignments. Available stock
    is re-validated here (fast path) and again inside
    services.create_accessory_assignment (race-safe path under the
    accessory's row lock) — see that function's docstring."""

    accessory_sku = serializers.CharField(source="accessory.sku", read_only=True)
    accessory_name = serializers.CharField(source="accessory.name", read_only=True)
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    department = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()

    class Meta:
        model = AccessoryAssignment
        fields = [
            "id", "accessory", "accessory_sku", "accessory_name",
            "employee", "employee_name", "department", "location",
            "quantity", "assigned_date", "status", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def get_department(self, obj):
        return obj.employee.department.name if obj.employee.department_id else None

    def get_location(self, obj):
        return obj.employee.location.name if obj.employee.location_id else None

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value

    def validate(self, attrs):
        accessory = attrs.get("accessory") or getattr(self.instance, "accessory", None)
        quantity = attrs.get("quantity") or getattr(self.instance, "quantity", None)
        if accessory is not None and quantity is not None:
            available = accessory.total_qty - accessory.assigned_qty
            if quantity > available:
                raise serializers.ValidationError(
                    {"quantity": f"Only {available} units are available."}
                )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        try:
            return services.create_accessory_assignment(
                accessory=validated_data["accessory"],
                employee=validated_data["employee"],
                quantity=validated_data["quantity"],
                assigned_date=validated_data["assigned_date"],
                notes=validated_data.get("notes", ""),
                actor=getattr(request, "user", None),
            )
        except services.InsufficientStockError as exc:
            raise serializers.ValidationError(
                {"quantity": f"Only {exc.available} units are available."}
            )
        except OperationalError:
            raise serializers.ValidationError(
                {"accessory": "This accessory is being updated by another request — please try again."}
            )


class SoftwareLicenseSerializer(serializers.ModelSerializer):
    """Read AND write shape. license_id is server-generated (e.g. "LIC-015")
    and never accepted from the client. license_key falls back to a
    server-generated default when left blank, matching the Add form's
    pre-filled-but-editable key field. available_seats/utilization_pct/
    status are computed, not stored."""

    available_seats = serializers.IntegerField(read_only=True)
    utilization_pct = serializers.FloatField(read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = SoftwareLicense
        fields = [
            "id", "license_id", "name", "vendor", "category", "license_type", "license_key",
            "total_seats", "seats_used", "purchase_date", "expiry_date", "auto_renew",
            "cost", "notes", "available_seats", "utilization_pct", "status",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "license_id", "created_at", "updated_at"]
        extra_kwargs = {"license_key": {"required": False, "allow_blank": True}}

    def validate_cost(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Cost cannot be negative.")
        return value

    def validate(self, attrs):
        total_seats = attrs.get("total_seats", getattr(self.instance, "total_seats", 0))
        seats_used = attrs.get("seats_used", getattr(self.instance, "seats_used", 0))
        if seats_used > total_seats:
            raise serializers.ValidationError({"seats_used": "Seats used can't exceed total seats."})

        license_type = attrs.get("license_type", getattr(self.instance, "license_type", None))
        if license_type == SoftwareLicense.TYPE_PERPETUAL:
            attrs["expiry_date"] = None
        else:
            # Only Perpetual licenses go without an expiry — `status` (see
            # SoftwareLicense.status) falls back to "Perpetual" for ANY
            # license with no expiry_date, so a Monthly/Annual/One-Time
            # license created without one would silently misreport as
            # Perpetual instead of Active/Expiring Soon/Expired.
            expiry_date = attrs.get("expiry_date", getattr(self.instance, "expiry_date", None))
            if not expiry_date:
                raise serializers.ValidationError(
                    {"expiry_date": "Expiry date is required unless the license type is Perpetual."}
                )
        return attrs

    def create(self, validated_data):
        if not validated_data.get("license_key"):
            validated_data["license_key"] = random_license_key()
        last_error = None
        for _ in range(5):
            validated_data["license_id"] = next_license_id()
            try:
                with transaction.atomic():
                    return super().create(validated_data)
            except IntegrityError as exc:
                last_error = exc
                continue
        raise serializers.ValidationError(
            {"license_id": "Could not generate a unique license id — please retry."}
        ) from last_error
