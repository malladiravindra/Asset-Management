from decimal import Decimal

from rest_framework import serializers

from .models import Brand, Category, Model


def format_lakhs(value):
    """₹ value -> "₹ X.XL" (lakhs = 100,000), matching the header stat
    format shown on the Catalog page's Categories/Brands/Models cards."""
    value = value or Decimal("0")
    return f"₹ {(value / Decimal('100000')):.1f}L"


class ComputedStatsMixin(serializers.Serializer):
    """asset_count/model_count come from the viewset's annotate() (see
    catalog/views.py) — this mixin just formats what's already on the
    instance. percent_of_fleet needs `total_assets` in the serializer
    context (the viewsets set it in get_serializer_context())."""

    asset_count = serializers.IntegerField(read_only=True, default=0)
    percent_of_fleet = serializers.SerializerMethodField()
    current_asset_value = serializers.SerializerMethodField()

    def get_percent_of_fleet(self, obj):
        total = self.context.get("total_assets") or 0
        count = getattr(obj, "asset_count", 0) or 0
        if not total:
            return 0.0
        return round((count / total) * 100, 1)

    def get_current_asset_value(self, obj):
        return format_lakhs(getattr(obj, "current_value_sum", None))


class CategorySerializer(ComputedStatsMixin, serializers.ModelSerializer):
    model_count = serializers.IntegerField(read_only=True, default=0)

    # name/icon/color are declared explicitly (not left to ModelSerializer's
    # auto-generation) for two reasons:
    #   1. name: auto-generation would attach DRF's own UniqueValidator,
    #      which — being a *field*-level validator — runs before
    #      validate_name() below and would intercept exact-case duplicates
    #      with its own default wording (lowercase, list-wrapped), leaving
    #      validate_name() to only ever catch case-*different* duplicates.
    #      Declaring it explicitly skips that auto-validator, so
    #      validate_name() is the single source of truth — and single
    #      message — for every duplicate, exact-case included.
    #   2. icon/color: the model sets blank=True (an admin/forms-only
    #      concern), which makes ModelSerializer auto-infer required=False
    #      for both — overridden back to required here, the same pattern
    #      AssetWriteSerializer's extra_kwargs already uses for
    #      status/condition/warranty_status.
    # The Add Category modal's contract wants a flat string per field
    # ({"name": "..."} not {"name": ["..."]}) — these error_messages supply
    # that text; CategoryViewSet.create() flattens DRF's list wrapper around
    # them into that exact shape.
    name = serializers.CharField(
        max_length=100,
        error_messages={
            "blank": "Category name is required.",
            "required": "Category name is required.",
        },
    )
    # Optional with sensible defaults — unlike `name`, the Add Category
    # modal (and any other client) shouldn't be forced to send these.
    # allow_blank so an explicitly-sent "" also falls back to the default
    # rather than persisting an empty string (see validate_icon/color).
    icon = serializers.CharField(max_length=50, required=False, allow_blank=True, default="package")
    color = serializers.CharField(max_length=30, required=False, allow_blank=True, default="blue")

    class Meta:
        model = Category
        fields = [
            "id", "name", "icon", "color", "description", "code",
            "asset_count", "model_count", "percent_of_fleet", "current_asset_value",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Category name is required.")
        qs = Category.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A category with this name already exists.")
        return value

    def validate_icon(self, value):
        return value.strip() or "package"

    def validate_color(self, value):
        return value.strip() or "blue"


class CategoryDetailSerializer(CategorySerializer):
    """Adds the linked-models list — only worth the extra query on a single
    category (GET /categories/<id>/), not on every row of the list view."""

    models = serializers.SerializerMethodField()

    class Meta(CategorySerializer.Meta):
        fields = CategorySerializer.Meta.fields + ["models"]

    def get_models(self, obj):
        return [
            {
                "id": m.id,
                "name": m.name,
                "brand": m.brand_id,
                "brand_name": m.brand.name if m.brand_id else None,
            }
            for m in obj.models.select_related("brand").order_by("name")
        ]


class BrandSerializer(ComputedStatsMixin, serializers.ModelSerializer):
    model_count = serializers.IntegerField(read_only=True, default=0)
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)

    # Declared explicitly (not left to ModelSerializer's auto-generation)
    # for the same reason as CategorySerializer.name: auto-generation would
    # attach DRF's own UniqueValidator to the field, which runs before
    # validate_name() below and intercepts every duplicate with its own
    # generic wording ("brand with this name already exists.", no clear
    # 400 message) instead of the one below.
    name = serializers.CharField(
        max_length=100,
        error_messages={
            "blank": "Brand name is required.",
            "required": "Brand name is required.",
        },
    )

    class Meta:
        model = Brand
        fields = [
            "id", "name", "logo", "description", "color_key", "category", "category_name",
            "asset_count", "model_count", "percent_of_fleet", "current_asset_value",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"category": {"required": False, "allow_null": True}}

    def validate_color_key(self, value):
        return (value or "").strip() or "blue"

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Brand name is required.")
        qs = Brand.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A brand with this name already exists.")
        return value


class BrandDetailSerializer(BrandSerializer):
    """Adds the linked-models list for GET /brands/<id>/ click-through."""

    models = serializers.SerializerMethodField()

    class Meta(BrandSerializer.Meta):
        fields = BrandSerializer.Meta.fields + ["models"]

    def get_models(self, obj):
        return [
            {
                "id": m.id,
                "name": m.name,
                "category": m.category_id,
                "category_name": m.category.name if m.category_id else None,
            }
            for m in obj.models.select_related("category").order_by("name")
        ]


class ModelSerializer(ComputedStatsMixin, serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True)

    # name declared explicitly for the same reason as Brand/Category.name —
    # skips DRF's auto UniqueValidator so validate_name() below is the
    # single source of the duplicate message. category/brand declared
    # explicitly just for clearer required-field messages (Meta below still
    # drives the actual PK/queryset wiring via ModelSerializer).
    name = serializers.CharField(
        max_length=200,
        error_messages={
            "blank": "Model name is required.",
            "required": "Model name is required.",
        },
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        error_messages={
            "required": "Category is required.",
            "does_not_exist": "Selected category does not exist.",
            "incorrect_type": "Invalid category id.",
        },
    )
    brand = serializers.PrimaryKeyRelatedField(
        queryset=Brand.objects.all(),
        error_messages={
            "required": "Brand is required.",
            "does_not_exist": "Selected brand does not exist.",
            "incorrect_type": "Invalid brand id.",
        },
    )

    class Meta:
        model = Model
        fields = [
            "id", "name", "category", "category_name", "brand", "brand_name",
            "specifications", "asset_count", "percent_of_fleet", "current_asset_value",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Model name is required.")
        qs = Model.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A model with this name already exists.")
        return value
