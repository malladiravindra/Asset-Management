import re
from zoneinfo import available_timezones

from rest_framework import serializers

from .models import SystemSettings
from .services import LOCKED_FIELDS, PREFIX_RE, render_code_prefix, validate_code_format

PHONE_RE = re.compile(r"^[0-9+()\-\s]*$")

# Longest values the generated codes must fit into (see the target model
# fields: Asset.asset_code, PurchaseOrder.po_number, Employee.employee_id,
# RepairRecord.repair_id). Checked against a worst-case sample so a format
# can never be saved that would later fail on insert.
ASSET_CODE_MAX = 50
PO_NUMBER_MAX = 30
EMPLOYEE_ID_MAX = 20

PREFIX_FIELDS = ("employee_id_prefix", "asset_code_prefix", "po_prefix", "assignment_number_prefix", "repair_number_prefix")


class SystemSettingsSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SystemSettings
        exclude = ["id", "updated_by"]
        read_only_fields = ["updated_at"]
        # The model's MinValueValidator becomes DRF's min_value check, which
        # runs before validate_po_approval_threshold — give it the same wording.
        extra_kwargs = {
            "po_approval_threshold": {
                "error_messages": {"min_value": "Approval threshold must be greater than or equal to 0."}
            },
        }

    def get_updated_by_name(self, obj):
        user = obj.updated_by
        if not user:
            return None
        return user.get_full_name().strip() or user.username

    # ── Field-level validation ──────────────────────────────────────────────

    def validate_organization_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Organization name is required.")
        return value

    def validate_system_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("System name is required.")
        return value

    def validate_company_phone(self, value):
        value = value.strip()
        if not PHONE_RE.match(value):
            raise serializers.ValidationError("Phone may contain only digits, spaces, +, - and parentheses.")
        return value

    def validate_timezone(self, value):
        if value not in available_timezones():
            raise serializers.ValidationError(f"'{value}' is not a valid IANA timezone.")
        return value

    def validate_po_approval_threshold(self, value):
        if value < 0:
            raise serializers.ValidationError("Approval threshold must be greater than or equal to 0.")
        return value

    def validate_asset_number_format(self, value):
        value = value.strip()
        error = validate_code_format(value, {"{PREFIX}", "{CATEGORY}", "{YEAR}"})
        if error:
            raise serializers.ValidationError(error)
        return value

    def validate_po_number_format(self, value):
        value = value.strip()
        error = validate_code_format(value, {"{PREFIX}", "{YEAR}"})
        if error:
            raise serializers.ValidationError(error)
        return value

    def validate(self, attrs):
        errors = {}

        def current(name):
            if name in attrs:
                return attrs[name]
            return getattr(self.instance, name) if self.instance is not None else None

        for name in PREFIX_FIELDS:
            if name in attrs:
                attrs[name] = attrs[name].strip().upper()
                if not PREFIX_RE.match(attrs[name]):
                    errors[name] = "Prefix must be 1–10 letters or digits (no spaces or symbols)."

        for name, (fixed_value, reason) in LOCKED_FIELDS.items():
            if name in attrs and attrs[name] != fixed_value:
                errors[name] = f"This setting cannot be changed. {reason}"

        if current("maintenance_mode") and not (current("maintenance_message") or "").strip():
            errors["maintenance_message"] = "A maintenance message is required while maintenance mode is on."

        asset_fmt, asset_prefix = current("asset_number_format"), current("asset_code_prefix")
        if asset_fmt and asset_prefix and "asset_number_format" not in errors and "asset_code_prefix" not in errors:
            sample = render_code_prefix(asset_fmt, prefix=asset_prefix, category="ABCD", year=2026) + "999999"
            if len(sample) > ASSET_CODE_MAX:
                errors["asset_number_format"] = f"Generated asset codes would exceed {ASSET_CODE_MAX} characters."

        po_fmt, po_prefix = current("po_number_format"), current("po_prefix")
        if po_fmt and po_prefix and "po_number_format" not in errors and "po_prefix" not in errors:
            sample = render_code_prefix(po_fmt, prefix=po_prefix, year=2026) + "999999"
            if len(sample) > PO_NUMBER_MAX:
                errors["po_number_format"] = f"Generated PO numbers would exceed {PO_NUMBER_MAX} characters."

        emp_prefix = current("employee_id_prefix")
        if emp_prefix and "employee_id_prefix" not in errors and len(f"{emp_prefix}-999999") > EMPLOYEE_ID_MAX:
            errors["employee_id_prefix"] = f"Generated employee IDs would exceed {EMPLOYEE_ID_MAX} characters."

        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class TestEmailSerializer(serializers.Serializer):
    recipient = serializers.EmailField(required=False, allow_blank=True)
