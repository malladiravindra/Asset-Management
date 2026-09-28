from django.db import transaction
from django.db.models import ProtectedError
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ModelPermission
from notifications.services import notify_maintenance_status, notify_repair_status

from . import services
from .filters import AccessoryAssignmentFilter, AccessoryFilter, MaintenanceFilter, RepairFilter, SoftwareLicenseFilter
from .models import Accessory, AccessoryAssignment, MaintenanceRecord, RepairRecord, SoftwareLicense
from .serializers import (
    AccessoryAssignmentSerializer,
    AccessorySerializer,
    MaintenanceRecordSerializer,
    RepairRecordSerializer,
    SoftwareLicenseSerializer,
)

# APIView only, deliberately — no ViewSets/routers (mirrors
# organization/views.py and operations/views.py's List/Detail-pair-per-
# resource style). Each resource gets a queryset function (not a
# get_queryset() method — there's no shared base class here), a List view
# (GET collection + POST), and a Detail view (GET/PUT/PATCH/DELETE one).


class OperationPagination(PageNumberPagination):
    """Same page size as the rest of the API (see REST_FRAMEWORK.PAGE_SIZE)
    — declared explicitly so these list views can override it per-request
    with ?page_size= without changing the site-wide default."""
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# ------------------------------------------------------------- Maintenance


def maintenance_queryset():
    return MaintenanceRecord.objects.select_related("asset", "asset__category", "asset__location")


class MaintenanceListCreateAPIView(APIView):
    """GET  — Maintenance page list. Filter by ?status=/?priority=/?type=/
    ?asset=<id>, search by asset tag/name (?search=).
    POST — Add Maintenance record."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = MaintenanceRecord
    pagination_class = OperationPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = MaintenanceFilter
    search_fields = ["asset__asset_code", "asset__name", "technician"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        queryset = self.filter_queryset(maintenance_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = MaintenanceRecordSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = MaintenanceRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Record + asset status + notification commit together (services.sync_asset_service_status).
        with transaction.atomic():
            instance = serializer.save()
            services.sync_asset_service_status(instance.asset_id, actor=request.user)
            notify_maintenance_status(instance, actor=request.user)
        instance = maintenance_queryset().get(pk=instance.pk)
        return Response(MaintenanceRecordSerializer(instance).data, status=status.HTTP_201_CREATED)


class MaintenanceDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = MaintenanceRecord

    def get_object(self, pk):
        return get_object_or_404(maintenance_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(MaintenanceRecordSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        previous_asset_id = instance.asset_id
        previous_status = instance.status
        serializer = MaintenanceRecordSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            instance = serializer.save()
            services.sync_asset_service_status(instance.asset_id, actor=request.user)
            if previous_asset_id != instance.asset_id:
                services.sync_asset_service_status(previous_asset_id, actor=request.user)
            if instance.status != previous_status:
                notify_maintenance_status(instance, actor=request.user)
        instance = maintenance_queryset().get(pk=instance.pk)
        return Response(MaintenanceRecordSerializer(instance).data)

    def delete(self, request, pk):
        instance = self.get_object(pk)
        with transaction.atomic():
            asset_id = instance.asset_id
            instance.delete()
            services.sync_asset_service_status(asset_id, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------------- Repairs


def repair_queryset():
    return RepairRecord.objects.select_related("asset", "asset__category", "asset__location")


class RepairListCreateAPIView(APIView):
    """GET  — Repairs page list. Filter by ?status=/?priority=/?issue_type=/
    ?asset=<id>, search by asset tag/name/issue (?search=).
    POST — Add Repair record (repair_id is server-generated)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = RepairRecord
    pagination_class = OperationPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = RepairFilter
    search_fields = ["repair_id", "asset__asset_code", "asset__name", "issue"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        queryset = self.filter_queryset(repair_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = RepairRecordSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = RepairRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Record + asset status + notification commit together (services.sync_asset_service_status).
        with transaction.atomic():
            instance = serializer.save()
            services.sync_asset_service_status(instance.asset_id, actor=request.user)
            notify_repair_status(instance, actor=request.user)
        instance = repair_queryset().get(pk=instance.pk)
        return Response(RepairRecordSerializer(instance).data, status=status.HTTP_201_CREATED)


class RepairDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = RepairRecord

    def get_object(self, pk):
        return get_object_or_404(repair_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(RepairRecordSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        previous_asset_id = instance.asset_id
        previous_status = instance.status
        serializer = RepairRecordSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            instance = serializer.save()
            services.sync_asset_service_status(instance.asset_id, actor=request.user)
            if previous_asset_id != instance.asset_id:
                services.sync_asset_service_status(previous_asset_id, actor=request.user)
            if instance.status != previous_status:
                notify_repair_status(instance, actor=request.user)
        instance = repair_queryset().get(pk=instance.pk)
        return Response(RepairRecordSerializer(instance).data)

    def delete(self, request, pk):
        instance = self.get_object(pk)
        with transaction.atomic():
            asset_id = instance.asset_id
            instance.delete()
            services.sync_asset_service_status(asset_id, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# -------------------------------------------------------------- Accessories


def accessory_queryset():
    return Accessory.objects.select_related("location")


class AccessoryListCreateAPIView(APIView):
    """GET  — Accessories page list. Filter by ?category=/?item_status=/
    ?condition=/?location=<id>, search by SKU/name/vendor (?search=).
    POST — Add Accessory (sku auto-generated from category if left blank)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Accessory
    pagination_class = OperationPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = AccessoryFilter
    search_fields = ["sku", "name", "vendor", "brand"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        queryset = self.filter_queryset(accessory_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = AccessorySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AccessorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = accessory_queryset().get(pk=instance.pk)
        return Response(AccessorySerializer(instance).data, status=status.HTTP_201_CREATED)


class AccessoryDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Accessory

    def get_object(self, pk):
        return get_object_or_404(accessory_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(AccessorySerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        serializer = AccessorySerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = accessory_queryset().get(pk=instance.pk)
        return Response(AccessorySerializer(instance).data)

    def delete(self, request, pk):
        instance = self.get_object(pk)
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {"detail": "Can't delete — this accessory is still referenced elsewhere."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------- Accessory Assignments


def accessory_assignment_queryset():
    return AccessoryAssignment.objects.select_related(
        "accessory", "employee", "employee__department", "employee__location"
    )


class AccessoryAssignmentListAPIView(APIView):
    """GET  — assignment history, filterable by ?employee=<id> (what the
    Assign Accessory modal's "Currently Assigned" section queries),
    ?accessory=<id>, ?status=, ?department=, ?location=.
    POST — Assign Accessory: validates quantity against the accessory's
    live available stock (see AccessoryAssignmentSerializer.validate) and
    atomically creates the history row + increments
    Accessory.assigned_qty (see operation.services.create_accessory_assignment)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = AccessoryAssignment
    pagination_class = OperationPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = AccessoryAssignmentFilter

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        queryset = self.filter_queryset(accessory_assignment_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = AccessoryAssignmentSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AccessoryAssignmentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = accessory_assignment_queryset().get(pk=instance.pk)
        return Response(AccessoryAssignmentSerializer(instance).data, status=status.HTTP_201_CREATED)


# --------------------------------------------------------- Software Licenses


def software_license_queryset():
    return SoftwareLicense.objects.all()


class SoftwareLicenseListCreateAPIView(APIView):
    """GET  — Software Licenses page list. Filter by ?category=/
    ?license_type=, search by name/vendor (?search=).
    POST — Add Software License (license_id is server-generated; license_key
    is auto-generated if left blank)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = SoftwareLicense
    pagination_class = OperationPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = SoftwareLicenseFilter
    search_fields = ["license_id", "name", "vendor"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        queryset = self.filter_queryset(software_license_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = SoftwareLicenseSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = SoftwareLicenseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(SoftwareLicenseSerializer(instance).data, status=status.HTTP_201_CREATED)


class SoftwareLicenseDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = SoftwareLicense

    def get_object(self, pk):
        return get_object_or_404(software_license_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(SoftwareLicenseSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        serializer = SoftwareLicenseSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(SoftwareLicenseSerializer(instance).data)

    def delete(self, request, pk):
        self.get_object(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
