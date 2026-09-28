from decimal import Decimal

from django.db.models import Count, DecimalField, IntegerField, OuterRef, ProtectedError, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
from rest_framework import filters, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ModelPermission
from assets.models import Asset

from .models import Brand, Category, Model
from .serializers import (
    BrandDetailSerializer,
    BrandSerializer,
    CategoryDetailSerializer,
    CategorySerializer,
    ModelSerializer,
    format_lakhs,
)


class CatalogPagination(PageNumberPagination):
    """Same page size as the rest of the API (see REST_FRAMEWORK.PAGE_SIZE)
    — declared explicitly here so the Catalog table view can override it
    per-request with ?page_size= without changing the site-wide default."""
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def _subquery_count(model, fk_name):
    """Count of `model` rows pointing at this row via `fk_name`, as a
    correlated subquery — NOT a joined annotate(Count(...)). Two aggregates
    over two different reverse relations (e.g. assets AND models on
    Category) in one joined annotate() multiply rows against each other
    (the classic Django "fan-out" bug) and silently inflate both counts.
    Independent subqueries side-step that entirely, still in one query."""
    qs = model.objects.filter(**{fk_name: OuterRef("pk")}).order_by().values(fk_name)
    return Coalesce(Subquery(qs.annotate(c=Count("id")).values("c"), output_field=IntegerField()), 0)


def _subquery_value_sum(model, fk_name, value_field="current_value"):
    qs = model.objects.filter(**{fk_name: OuterRef("pk")}).order_by().values(fk_name)
    return Coalesce(
        Subquery(
            qs.annotate(s=Sum(value_field)).values("s"),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        ),
        Decimal("0"),
    )


def annotated_categories():
    return Category.objects.annotate(
        asset_count=_subquery_count(Asset, "category"),
        model_count=_subquery_count(Model, "category"),
        current_value_sum=_subquery_value_sum(Asset, "category"),
    )


def annotated_brands():
    return Brand.objects.select_related("category").annotate(
        asset_count=_subquery_count(Asset, "brand"),
        model_count=_subquery_count(Model, "brand"),
        current_value_sum=_subquery_value_sum(Asset, "brand"),
    )


def annotated_models():
    return Model.objects.select_related("category", "brand").annotate(
        asset_count=_subquery_count(Asset, "model"),
        current_value_sum=_subquery_value_sum(Asset, "model"),
    )


class ProtectedDestroyMixin:
    """PROTECT is set on every FK into these three models (see
    catalog/models.py + Asset.category/brand/model) — without this, trying
    to delete a Category/Brand/Model that's still in use surfaces Django's
    ProtectedError as an unhandled 500 instead of a clean 400."""

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError(
                {"detail": "Can't delete — one or more assets or catalog entries still reference this."}
            )


class StatsContextMixin:
    """percent_of_fleet needs the fleet-wide asset total, computed once per
    request rather than per row."""

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["total_assets"] = Asset.objects.count()
        return ctx


class FlatFieldErrorCreateMixin:
    """Same as CreateModelMixin.create() except a 400 body comes back as
    {"field": "message"} instead of DRF's default {"field": ["message"]}
    — the Add Category/Brand/Model modals' contract wants a flat string
    per field (see each serializer's custom error_messages/validate_name,
    which supply that text)."""

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                flattened = {
                    field: (str(msgs[0]) if isinstance(msgs, list) and msgs else str(msgs))
                    for field, msgs in detail.items()
                }
                return Response(flattened, status=status.HTTP_400_BAD_REQUEST)
            raise
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class CatalogAPIView(APIView):
    # Subclasses set permission_model (see accounts.permissions.ModelPermission).
    permission_classes = [IsAuthenticated, ModelPermission]
    pagination_class = CatalogPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = []
    search_fields = []
    ordering_fields = []
    queryset_factory = None
    serializer_class = None
    detail_serializer_class = None

    def get_queryset(self):
        return self.queryset_factory().order_by("name")

    def filter_queryset(self, queryset):
        for backend in self.filter_backends:
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def serializer_for(self, instance=None, *, detail=False, data=None, partial=False, many=False):
        serializer_class = self.detail_serializer_class if detail else self.serializer_class
        kwargs = {"context": {"request": self.request, "total_assets": Asset.objects.count()}, "many": many}
        if data is not None:
            kwargs.update(data=data, partial=partial)
        return serializer_class(instance, **kwargs)

    def get_object(self, pk):
        return get_object_or_404(self.get_queryset(), pk=pk)

    def get(self, request, pk=None):
        if pk is not None:
            return Response(self.serializer_for(self.get_object(pk), detail=True).data)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(self.filter_queryset(self.get_queryset()), request, view=self)
        return paginator.get_paginated_response(self.serializer_for(page, detail=False, many=True).data)

    def post(self, request):
        serializer = self.serializer_for(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                detail = {field: str(messages[0]) if isinstance(messages, list) else str(messages)
                          for field, messages in detail.items()}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)
        instance = serializer.save()
        return Response(self.serializer_for(instance).data, status=status.HTTP_201_CREATED)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        serializer = self.serializer_for(self.get_object(pk), data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        return Response(self.serializer_for(serializer.save()).data)

    def delete(self, request, pk):
        instance = self.get_object(pk)
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {"detail": "Can't delete — one or more assets or catalog entries still reference this."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CategoryAPIView(CatalogAPIView):
    permission_model = Category
    queryset_factory = staticmethod(annotated_categories)
    serializer_class = CategorySerializer
    detail_serializer_class = CategoryDetailSerializer
    filterset_fields = ["name"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]


class BrandAPIView(CatalogAPIView):
    permission_model = Brand
    queryset_factory = staticmethod(annotated_brands)
    serializer_class = BrandSerializer
    detail_serializer_class = BrandDetailSerializer
    filterset_fields = ["name", "category"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]


class ModelAPIView(CatalogAPIView):
    permission_model = Model
    queryset_factory = staticmethod(annotated_models)
    serializer_class = ModelSerializer
    detail_serializer_class = ModelSerializer
    filterset_fields = ["name", "category", "brand"]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]


class CatalogSearchAPIView(APIView):
    """GET /api/catalog/search/?q= — the Catalog page's top search bar,
    across all three tabs at once."""
    permission_classes = [IsAuthenticated, ModelPermission]
    required_permissions = {"GET": ["catalog.view_category", "catalog.view_brand", "catalog.view_model"]}

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if not q:
            return Response({"categories": [], "brands": [], "models": []})

        ctx = {"total_assets": Asset.objects.count(), "request": request}
        categories = annotated_categories().filter(
            Q(name__icontains=q) | Q(description__icontains=q)
        ).order_by("name")[:10]
        brands = annotated_brands().filter(
            Q(name__icontains=q) | Q(description__icontains=q)
        ).order_by("name")[:10]
        models_qs = annotated_models().filter(name__icontains=q).order_by("name")[:10]

        return Response({
            "categories": CategorySerializer(categories, many=True, context=ctx).data,
            "brands": BrandSerializer(brands, many=True, context=ctx).data,
            "models": ModelSerializer(models_qs, many=True, context=ctx).data,
        })


class CatalogSummaryAPIView(APIView):
    """GET /api/catalog/summary/ — overall totals for the Catalog page's
    header stat row."""
    permission_classes = [IsAuthenticated, ModelPermission]
    required_permissions = {"GET": ["catalog.view_category", "catalog.view_brand", "catalog.view_model", "assets.view_asset"]}

    def get(self, request):
        total_value = Asset.objects.aggregate(total=Sum("current_value"))["total"] or Decimal("0")
        return Response({
            "total_categories": Category.objects.count(),
            "total_brands": Brand.objects.count(),
            "total_models": Model.objects.count(),
            "total_assets": Asset.objects.count(),
            "total_value": format_lakhs(total_value),
            "total_value_raw": str(total_value),
        })
