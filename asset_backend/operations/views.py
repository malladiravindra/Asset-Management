from django.db import transaction
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ModelPermission
from notifications.services import notify_purchase_order_status

from . import services
from .filters import AssignmentFilter, PurchaseOrderFilter, ReturnFilter
from .models import Assignment, PurchaseOrder, Return
from .serializers import AssignmentSerializer, PurchaseOrderSerializer, ReturnSerializer


class OperationsPagination(PageNumberPagination):
    """Same page size as the rest of the API (see REST_FRAMEWORK.PAGE_SIZE)
    — declared explicitly so these list views can override it per-request
    with ?page_size= without changing the site-wide default."""
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# APIView only, deliberately — no ViewSets/routers (see organization/views.py
# for the same List/Detail-pair-per-resource style this mirrors). Each
# resource gets its own queryset function (not a get_queryset() method,
# since there's no shared base class to hang it off) plus a List view
# (GET collection + POST) and a Detail view (GET/PUT/PATCH/DELETE one).


# ------------------------------------------------------------ Purchase Orders


def purchase_order_queryset():
    return (
        PurchaseOrder.objects.select_related("vendor", "department", "requested_by")
        .prefetch_related("items")
        .order_by("-order_date", "-id")
    )


class PurchaseOrderListAPIView(APIView):
    """GET — Purchase Orders page list. Search by PO number/vendor/
    requester (?search=), filter by status/department/vendor id (?status=,
    ?department=, ?vendor=). POST — Create Purchase Order; creates the
    order and its line items together, atomically (see
    PurchaseOrderSerializer.create)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = PurchaseOrder
    pagination_class = OperationsPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PurchaseOrderFilter
    search_fields = ["po_number", "vendor__name", "requested_by__name"]
    ordering_fields = ["order_date", "expected_date", "created_at"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        queryset = self.filter_queryset(purchase_order_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PurchaseOrderSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = PurchaseOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = purchase_order_queryset().get(pk=instance.pk)
        return Response(PurchaseOrderSerializer(instance).data, status=status.HTTP_201_CREATED)


class PurchaseOrderDetailAPIView(APIView):
    """GET/PUT/PATCH/DELETE a single purchase order. PUT/PATCH with an
    `items` list replaces the order's line items (see
    PurchaseOrderSerializer.update); status-only PATCHes (advance/cancel)
    omit `items` and leave them untouched."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = PurchaseOrder

    def get_object(self, pk):
        return get_object_or_404(purchase_order_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(PurchaseOrderSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        previous_status = instance.status
        serializer = PurchaseOrderSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            instance = serializer.save()
            if instance.status != previous_status:
                notify_purchase_order_status(instance, actor=request.user)
        instance = purchase_order_queryset().get(pk=instance.pk)
        return Response(PurchaseOrderSerializer(instance).data)

    def delete(self, request, pk):
        instance = self.get_object(pk)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------- Assignments


def assignment_queryset():
    return Assignment.objects.select_related(
        "asset", "asset__category", "person", "person__department", "person__location"
    ).order_by("-assigned_date", "-id")


class AssignmentListAPIView(APIView):
    """GET — Assignments page list. Search by asset tag/name/employee
    (?search=), filter by status/asset/person/department/location id
    (?status=, ?asset=, ?person=, ?department=, ?location=). POST — Create
    Assignment; validates the asset/employee exist (404 via the FK lookup)
    and that the asset isn't already actively assigned (see
    AssignmentSerializer.validate), then keeps Asset.status/assigned_to in
    sync (see operations.services.create_assignment)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Assignment
    pagination_class = OperationsPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = AssignmentFilter
    search_fields = ["asset__asset_code", "asset__name", "person__name"]
    ordering_fields = ["assigned_date", "created_at"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        queryset = self.filter_queryset(assignment_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = AssignmentSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AssignmentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = assignment_queryset().get(pk=instance.pk)
        return Response(AssignmentSerializer(instance).data, status=status.HTTP_201_CREATED)


class AssignmentDetailAPIView(APIView):
    """GET/PUT/PATCH edit assignment particulars (asset/person/
    assigned_date) — status only ever changes by recording a Return
    (POST /api/operations/returns/; status is read_only on
    AssignmentSerializer). DELETE removes
    the assignment and, if it was still active, frees up the asset it was
    holding (see operations.services.delete_assignment)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Assignment

    def get_object(self, pk):
        return get_object_or_404(assignment_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(AssignmentSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        serializer = AssignmentSerializer(
            instance, data=request.data, partial=partial, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = assignment_queryset().get(pk=instance.pk)
        return Response(AssignmentSerializer(instance).data)

    def delete(self, request, pk):
        instance = self.get_object(pk)
        services.delete_assignment(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------- Returns


def return_queryset():
    return Return.objects.select_related(
        "assignment",
        "assignment__asset",
        "assignment__asset__category",
        "assignment__person",
        "assignment__person__department",
        "assignment__person__location",
    ).order_by("-return_date", "-id")


class ReturnListAPIView(APIView):
    """GET — Returns page list. Search by asset tag/name/employee
    (?search=), filter by condition/department/location id (?condition=,
    ?department=, ?location=). POST — Create a Return for an existing
    Assignment (`assignment` id in the body) — rejects an assignment
    that's already been returned or was never active (see
    ReturnSerializer.validate_assignment), and atomically flips the
    Assignment to Unassigned + frees/updates the Asset (see
    operations.services.process_return). Does not duplicate the
    assignment's own asset/employee fields — those are derived from
    `assignment` at read time (see ReturnSerializer)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Return
    pagination_class = OperationsPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ReturnFilter
    search_fields = [
        "assignment__asset__asset_code", "assignment__asset__name", "assignment__person__name",
    ]
    ordering_fields = ["return_date", "created_at"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        queryset = self.filter_queryset(return_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = ReturnSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = ReturnSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = return_queryset().get(pk=instance.pk)
        return Response(ReturnSerializer(instance).data, status=status.HTTP_201_CREATED)


class ReturnDetailAPIView(APIView):
    """GET/PUT/PATCH/DELETE a single return record. PUT/PATCH only edit
    the return's own fields (return_date/condition/reason/assignment) —
    they don't re-run the asset/assignment sync that happens on create."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Return

    def get_object(self, pk):
        return get_object_or_404(return_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(ReturnSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        serializer = ReturnSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = return_queryset().get(pk=instance.pk)
        return Response(ReturnSerializer(instance).data)

    def delete(self, request, pk):
        instance = self.get_object(pk)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
