"""
Reports serializers.

ReportAssetSerializer  — read shape for /api/reports/assets/.
                         Exposes the exact field names the frontend's Reports
                         CSV contract expects (tag, assignedTo, currentValue,
                         purchaseDate, warranty) while the model uses the
                         Django-idiomatic snake_case names internally.

Asset writes are not offered here — they go through /api/assets/
(assets.serializers.AssetWriteSerializer).
"""
from rest_framework import serializers

from assets.models import Asset


class ReportAssetSerializer(serializers.ModelSerializer):
    """
    Read shape — every field the Reports module needs for display and CSV export.
    Field names match the frontend contract documented in the spec (§29).
    """

    # Expose as "tag" (frontend contract) while the model stores it as asset_code.
    tag = serializers.CharField(source="asset_code", read_only=True)
    # Resolve FK names to plain strings.
    category = serializers.SlugRelatedField(slug_field="name", read_only=True)
    department = serializers.SlugRelatedField(slug_field="name", read_only=True)
    location = serializers.SlugRelatedField(slug_field="name", read_only=True)
    # Frontend contract field: assignedTo (camelCase).
    assignedTo = serializers.SerializerMethodField()
    # camelCase aliases for the model's snake_case fields.
    currentValue = serializers.DecimalField(
        source="current_value", max_digits=12, decimal_places=2, read_only=True
    )
    purchaseDate = serializers.DateField(source="purchase_date", read_only=True)
    # Frontend contract field: warranty (the model stores it as warranty_status).
    warranty = serializers.CharField(source="current_warranty_status", read_only=True)

    class Meta:
        model = Asset
        fields = [
            "id",
            "tag",
            "name",
            "category",
            "department",
            "status",
            "condition",
            "location",
            "assignedTo",
            "cost",
            "currentValue",
            "purchaseDate",
            "warranty",
        ]

    def get_assignedTo(self, obj):
        return obj.assigned_to.name if obj.assigned_to else None
