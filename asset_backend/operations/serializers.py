from datetime import date
from decimal import Decimal

from django.db import IntegrityError, OperationalError, transaction
from rest_framework import serializers

from assets.models import Asset, Department, Employee
from organization.models import Vendor
from system_settings.services import get_system_settings

from . import services
from .codes import next_po_number
from .models import Assignment, PurchaseOrder, PurchaseOrderItem, Return


# ----------------------------------------------------------- Purchase Orders


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseOrderItem
        fields = ["id", "name", "category", "quantity", "unit_cost"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Item name is required.")
        return value

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_unit_cost(self, value):
        if value <= 0:
            raise serializers.ValidationError("Unit cost must be greater than zero.")
        return value


class PurchaseOrderSerializer(serializers.ModelSerializer):
    """Read AND write shape. vendor/department/requested_by are plain name
    strings in both directions — declared as CharField (not
    PrimaryKeyRelatedField) so a GET reads the related object's name via
    its own __str__ (every one of Vendor/Department/Employee's __str__
    already just returns .name) with zero extra fields, and a POST/PATCH's
    validate_<field> below resolves that same string back to the real
    instance server-side. This matches the Add Purchase Order form, whose
    Vendor/Department/Requested By selects submit the option's name, not
    its id (see Asset-Management/src/components/purchase-orders/table.tsx)."""

    vendor = serializers.CharField()
    department = serializers.CharField()
    requested_by = serializers.CharField()
    items = PurchaseOrderItemSerializer(many=True)

    # Read-only echoes of the linked Vendor's own fields — derived live via
    # `source=`, never stored redundantly on PurchaseOrder itself (same
    # pattern as MaintenanceRecordSerializer.asset_tag/asset_name deriving
    # from the `asset` FK). These previously had no backend source at all;
    # the frontend collected them separately per-PO and lost them on
    # reload — now they always match whatever the vendor record says.
    vendor_company_name = serializers.CharField(source="vendor.company_name", read_only=True, default="")
    vendor_email = serializers.CharField(source="vendor.email", read_only=True, default="")
    vendor_phone = serializers.CharField(source="vendor.phone", read_only=True, default="")
    vendor_address = serializers.CharField(source="vendor.address", read_only=True, default="")

    # subtotal/tax/total are computed from the live line items + gst_rate,
    # never stored, so they can't drift from what the items actually add
    # up to (same reasoning as Accessory.stock_value/SoftwareLicense.status
    # being model @properties rather than columns).
    subtotal = serializers.SerializerMethodField()
    tax = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "po_number", "vendor", "vendor_company_name", "vendor_email",
            "vendor_phone", "vendor_address", "department", "requested_by", "items",
            "status", "order_date", "expected_date", "received_date", "notes",
            "gst_rate", "subtotal", "tax", "total",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "po_number", "order_date", "created_at", "updated_at"]

    def get_subtotal(self, obj):
        return sum((item.quantity * item.unit_cost for item in obj.items.all()), Decimal("0"))

    def get_tax(self, obj):
        rate = obj.gst_rate or Decimal("0")
        return round(self.get_subtotal(obj) * rate / Decimal("100"), 2)

    def get_total(self, obj):
        return self.get_subtotal(obj) + self.get_tax(obj)

    def validate_gst_rate(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("GST rate cannot be negative.")
        return value

    def validate_vendor(self, value):
        name = value.strip()
        vendor = Vendor.objects.filter(name__iexact=name).first()
        if vendor is None:
            raise serializers.ValidationError(f'Vendor "{value}" was not found.')
        return vendor

    def validate_department(self, value):
        name = value.strip()
        department = Department.objects.filter(name__iexact=name).first()
        if department is None:
            raise serializers.ValidationError(f'Department "{value}" was not found.')
        return department

    def validate_requested_by(self, value):
        name = value.strip()
        person = Employee.objects.filter(name__iexact=name).first()
        if person is None:
            raise serializers.ValidationError(f'Employee "{value}" was not found.')
        return person

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Add at least one item with a valid quantity.")
        return value

    def validate_status(self, value):
        # Settings > Purchase Orders > Allow Partial Receiving. Only blocks
        # moving INTO the status, so an order already partially received
        # stays editable.
        if (
            value == PurchaseOrder.STATUS_PARTIALLY_RECEIVED
            and not get_system_settings().allow_partial_receiving
            and getattr(self.instance, "status", None) != value
        ):
            raise serializers.ValidationError("Partial receiving is disabled in Settings.")
        return value

    def create(self, validated_data):
        # Settings > Purchase Orders > Default PO Status when none is sent.
        validated_data.setdefault("status", get_system_settings().default_po_status)
        items_data = validated_data.pop("items")
        # Retry a few times in case of a race on the generated po_number
        # (two near-simultaneous creates in the same year) — same approach
        # as AssetWriteSerializer.create's asset_code generation.
        last_error = None
        for _ in range(5):
            validated_data["po_number"] = next_po_number()
            try:
                with transaction.atomic():
                    order = super().create(validated_data)
                    PurchaseOrderItem.objects.bulk_create(
                        [PurchaseOrderItem(purchase_order=order, **item) for item in items_data]
                    )
                return order
            except IntegrityError as exc:
                last_error = exc
                continue
        raise serializers.ValidationError(
            {"po_number": "Could not generate a unique PO number — please retry."}
        ) from last_error

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if items_data is not None:
                instance.items.all().delete()
                PurchaseOrderItem.objects.bulk_create(
                    [PurchaseOrderItem(purchase_order=instance, **item) for item in items_data]
                )
        return instance


# ------------------------------------------------------------- Assignments


class AssignmentSerializer(serializers.ModelSerializer):
    """Read AND write shape. asset/person are accepted and returned by id
    (the Add Assignment form's Asset select already submits an id — see
    table.tsx's `assetId` state); asset_tag/asset_name/asset_category/
    employee_name/department/location are read-only fields DERIVED from
    those two relations, never stored redundantly (department/location
    come from the assigned Employee's current department/location, not a
    frozen snapshot — see class docstring in models.py).

    unassigned_date/condition/reason surface the linked Return's fields
    (None until one exists) so this serializer's output is a byte-for-byte
    match for the frontend's existing flat `Assignment` TypeScript type —
    see Asset-Management/src/components/assignments/data.ts — even though
    Return is a separate model/table."""

    asset_tag = serializers.SerializerMethodField()
    asset_name = serializers.SerializerMethodField()
    asset_category = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    unassigned_date = serializers.SerializerMethodField()
    condition = serializers.SerializerMethodField()
    reason = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id", "asset", "asset_tag", "asset_name", "asset_category",
            "person", "employee_name", "department", "location",
            "assigned_date", "unassigned_date", "status", "condition", "reason",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def _return(self, obj):
        try:
            return obj.return_record
        except Return.DoesNotExist:
            return None

    def get_asset_tag(self, obj):
        return obj.asset.asset_code

    def get_asset_name(self, obj):
        return obj.asset.name

    def get_asset_category(self, obj):
        return obj.asset.category.name

    def get_employee_name(self, obj):
        return obj.person.name

    def get_department(self, obj):
        return obj.person.department.name if obj.person.department_id else None

    def get_location(self, obj):
        return obj.person.location.name if obj.person.location_id else None

    def get_unassigned_date(self, obj):
        r = self._return(obj)
        return r.return_date if r else None

    def get_condition(self, obj):
        r = self._return(obj)
        return r.condition if r else None

    def get_reason(self, obj):
        r = self._return(obj)
        return r.reason or None if r else None

    def validate(self, attrs):
        asset = attrs.get("asset") or getattr(self.instance, "asset", None)
        if self.instance is None:
            if asset is not None:
                already_assigned = Assignment.objects.filter(
                    asset=asset, status=Assignment.STATUS_ASSIGNED
                ).exists()
                if already_assigned:
                    raise serializers.ValidationError(
                        {"asset": "This asset is already assigned to someone."}
                    )
        else:
            # Update path: only re-check when `asset` is actually being
            # changed to a DIFFERENT asset — a PATCH that leaves asset/person
            # untouched (e.g. just a notes/date field) must keep saving even
            # though this same Assignment is itself the active holder of its
            # current asset.
            new_asset = attrs.get("asset")
            if new_asset is not None and new_asset.pk != self.instance.asset_id:
                conflict = (
                    Assignment.objects.filter(asset=new_asset, status=Assignment.STATUS_ASSIGNED)
                    .exclude(pk=self.instance.pk)
                    .exists()
                )
                if conflict:
                    raise serializers.ValidationError(
                        {"asset": "This asset is already assigned to someone."}
                    )
            # Settings > Assignments > Allow Reassignment: moving an ACTIVE
            # assignment to a different employee. Historical rows and
            # edits that keep the same person are unaffected.
            new_person = attrs.get("person")
            if (
                new_person is not None
                and new_person.pk != self.instance.person_id
                and self.instance.status == Assignment.STATUS_ASSIGNED
                and not get_system_settings().allow_reassignment
            ):
                raise serializers.ValidationError(
                    {"person": "Reassigning an active assignment to another employee is disabled in Settings."}
                )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        try:
            return services.create_assignment(
                asset=validated_data["asset"],
                person=validated_data["person"],
                assigned_date=validated_data["assigned_date"],
                actor=getattr(request, "user", None),
            )
        except services.AssetAlreadyAssignedError:
            # Same message/shape as the fast-path check above — this is
            # just the race-safe re-check inside the locked transaction
            # catching what a concurrent request slipped past it (see
            # AssetAlreadyAssignedError's docstring in services.py).
            raise serializers.ValidationError({"asset": "This asset is already assigned to someone."})
        except OperationalError:
            # A concurrent request held a conflicting lock on the same
            # row(s) long enough that the database gave up waiting instead
            # of serializing cleanly (e.g. SQLite's coarser table-level
            # locking under contention — has no real row locks, see
            # AssetAlreadyAssignedError's docstring — or a Postgres
            # deadlock). Surface as a retryable conflict rather than an
            # unhandled 500.
            raise serializers.ValidationError(
                {"asset": "This asset is being updated by another request — please try again."}
            )

    def update(self, instance, validated_data):
        request = self.context.get("request")
        try:
            return services.update_assignment(
                instance=instance,
                validated_data=validated_data,
                actor=getattr(request, "user", None),
            )
        except services.AssetAlreadyAssignedError:
            raise serializers.ValidationError({"asset": "This asset is already assigned to someone."})
        except OperationalError:
            raise serializers.ValidationError(
                {"asset": "This asset is being updated by another request — please try again."}
            )


# ----------------------------------------------------------------- Returns


class ReturnSerializer(serializers.ModelSerializer):
    """Read AND write shape for /api/operations/returns/. `assignment` is
    the only thing actually stored here (plus return_date/condition/
    reason) — every asset/employee identity field below is derived from
    `assignment` at read time rather than duplicated, per the "Returns
    must be based on Assignment records" requirement."""

    assignment = serializers.PrimaryKeyRelatedField(queryset=Assignment.objects.all())
    return_date = serializers.DateField(required=False)
    asset_id = serializers.SerializerMethodField()
    asset_tag = serializers.SerializerMethodField()
    asset_name = serializers.SerializerMethodField()
    asset_category = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    assigned_date = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Return
        fields = [
            "id", "return_number", "assignment",
            "asset_id", "asset_tag", "asset_name", "asset_category",
            "employee_name", "department", "location",
            "assigned_date", "return_date", "status", "condition", "reason",
            "created_at",
        ]
        read_only_fields = ["id", "return_number", "created_at"]

    def get_asset_id(self, obj):
        return obj.assignment.asset_id

    def get_asset_tag(self, obj):
        return obj.assignment.asset.asset_code

    def get_asset_name(self, obj):
        return obj.assignment.asset.name

    def get_asset_category(self, obj):
        return obj.assignment.asset.category.name

    def get_employee_name(self, obj):
        return obj.assignment.person.name

    def get_department(self, obj):
        person = obj.assignment.person
        return person.department.name if person.department_id else None

    def get_location(self, obj):
        person = obj.assignment.person
        return person.location.name if person.location_id else None

    def get_assigned_date(self, obj):
        return obj.assignment.assigned_date

    def get_status(self, obj):
        return Assignment.STATUS_UNASSIGNED

    def validate_assignment(self, value):
        if value.status != Assignment.STATUS_ASSIGNED:
            raise serializers.ValidationError(
                "This assignment has already been returned (or was never active)."
            )
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        return services.process_return(
            assignment=validated_data["assignment"],
            return_date=validated_data.get("return_date") or date.today(),
            condition=validated_data.get("condition"),
            reason=validated_data.get("reason", ""),
            actor=getattr(request, "user", None),
        )
