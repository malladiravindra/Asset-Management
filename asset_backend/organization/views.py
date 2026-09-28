from decimal import Decimal

from django.db.models import Avg, Count, DecimalField, ProtectedError, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ModelPermission
from assets.models import Asset, Department, Location, Employee

from .filters import LocationFilter, EmployeeFilter, VendorFilter
from .models import Vendor
from .serializers import DepartmentSerializer, LocationSerializer, EmployeeSerializer, VendorSerializer
from .utils import subquery_count, subquery_sum


def annotated_employees():
    # asset_count is a single relation (assigned_assets) — plain
    # annotate(Count(...)) is safe.
    return Employee.objects.select_related("department", "location", "user").annotate(
        asset_count=Count("assigned_assets")
    )


def annotated_departments():
    # employee_count (employees) and asset_count (assets) are two DIFFERENT
    # relations — needs the fan-out-safe subquery form (see utils.py).
    return Department.objects.annotate(
        employee_count=subquery_count(Employee, "department"),
        asset_count=subquery_count(Asset, "department"),
    )


def annotated_locations():
    # asset_count/current_asset_value/in_repair_count all come off the
    # `assets` relation; employee_count comes off the DIFFERENT `employees`
    # relation — same fan-out risk as Department, same subquery fix.
    return Location.objects.annotate(
        asset_count=subquery_count(Asset, "location"),
        employee_count=subquery_count(Employee, "location"),
        current_asset_value=subquery_sum(Asset, "location", "current_value"),
        in_repair_count=subquery_count(Asset, "location", extra_filter={"status": Asset.STATUS_IN_REPAIR}),
    )


def location_summary():
    """Header stats + per-type tab counts for the Locations page, computed
    over EVERY location regardless of the request's ?type=/?search=
    filters — the "All (7) / Headquarters (3) / Branch Office (3) /
    Remote (1)" tab counts would be wrong if they moved with whichever
    tab is currently selected."""
    type_counts = dict(
        Location.objects.order_by().values("type").annotate(c=Count("id")).values_list("type", "c")
    )
    return {
        "total_locations": Location.objects.count(),
        "total_assets": Asset.objects.count(),
        "total_employees": Employee.objects.count(),
        "headquarters_count": type_counts.get(Location.TYPE_HEADQUARTERS, 0),
        "branch_office_count": type_counts.get(Location.TYPE_BRANCH_OFFICE, 0),
        "remote_count": type_counts.get(Location.TYPE_REMOTE, 0),
    }


def annotated_vendors():
    # asset_count/total_spend/avg_cost all aggregate the SAME relation
    # (assets) in one annotate() call — safe, no fan-out (see
    # VendorSerializer's docstring).
    money = DecimalField(max_digits=14, decimal_places=2)
    return Vendor.objects.annotate(
        asset_count=Count("assets"),
        total_spend=Coalesce(Sum("assets__cost"), Decimal("0"), output_field=money),
        avg_cost=Coalesce(Avg("assets__cost"), Decimal("0"), output_field=money),
    )


class OrgPagination(PageNumberPagination):
    """Same page size as the rest of the API (see REST_FRAMEWORK.PAGE_SIZE)
    — declared explicitly so these list views can override it per-request
    with ?page_size= without changing the site-wide default."""
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# -------------------------------------------------------------- Employees ---


class EmployeeListAPIView(APIView):
    """GET  — Organization > Employees tab. Filter pills by department
    (?department=<id>) and/or location (?location=<id>), search by
    name/employee_id/designation (?search=).
    POST — Add Employee."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Employee
    pagination_class = OrgPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = EmployeeFilter
    search_fields = ["name", "employee_id", "designation"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        queryset = self.filter_queryset(annotated_employees()).order_by("name")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = EmployeeSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = EmployeeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = annotated_employees().get(pk=instance.pk)
        return Response(EmployeeSerializer(instance).data, status=status.HTTP_201_CREATED)


class EmployeeDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Employee

    def get_object(self, pk):
        return get_object_or_404(annotated_employees(), pk=pk)

    def get(self, request, pk):
        return Response(EmployeeSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        serializer = EmployeeSerializer(instance, data=request.data, partial=partial, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = annotated_employees().get(pk=instance.pk)
        return Response(EmployeeSerializer(instance).data)

    def delete(self, request, pk):
        # Asset.assigned_to is on_delete=SET_NULL — deleting a Employee just
        # unassigns their asset(s). operations.Assignment/PurchaseOrder DO
        # use on_delete=PROTECT on Employee though (assignment/PO history
        # shouldn't silently lose who it was for), so this can still raise
        # ProtectedError once that app has data — surfaced as a clean 400,
        # same pattern as DepartmentDetailAPIView.delete below.
        instance = self.get_object(pk)
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {"detail": "Can't delete — one or more assignments or purchase orders still reference this employee."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------- Departments ---


def department_stats_context():
    # percent_of_fleet's denominator: total asset COUNT across every
    # department (see DepartmentSerializer.get_percent_of_fleet) — same
    # "compute once per request" reasoning as
    # LocationListAPIView._context/VendorListAPIView._context above.
    return {"total_assets": Asset.objects.count()}


class DepartmentListAPIView(APIView):
    """GET  — Organization > Departments tab, with live employee_count/asset_count/
    percent_of_fleet. Search by name (?search=).
    POST — Add Department (name required + unique; icon/color default to
    "" server-side — see DepartmentSerializer — the frontend sends its
    own first-icon/first-color default anyway)."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Department
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get(self, request):
        departments = self.filter_queryset(annotated_departments()).order_by("name")
        serializer = DepartmentSerializer(departments, many=True, context=department_stats_context())
        return Response(serializer.data)

    def post(self, request):
        serializer = DepartmentSerializer(data=request.data, context=department_stats_context())
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = annotated_departments().get(pk=instance.pk)
        return Response(
            DepartmentSerializer(instance, context=department_stats_context()).data,
            status=status.HTTP_201_CREATED,
        )


class DepartmentDetailAPIView(APIView):
    """GET/PUT/PATCH/DELETE a single department. Previously missing —
    DepartmentListAPIView only had list+create, so there was no way to
    edit or delete a department once added. Same shape as
    EmployeeDetailAPIView/LocationDetailAPIView above."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Department

    def get_object(self, pk):
        return get_object_or_404(annotated_departments(), pk=pk)

    def get(self, request, pk):
        instance = self.get_object(pk)
        return Response(DepartmentSerializer(instance, context=department_stats_context()).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        serializer = DepartmentSerializer(
            instance, data=request.data, partial=partial, context=department_stats_context()
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = annotated_departments().get(pk=instance.pk)
        return Response(DepartmentSerializer(instance, context=department_stats_context()).data)

    def delete(self, request, pk):
        # Asset.department is on_delete=PROTECT (Employee.department is
        # SET_NULL, so only assets can block this) — surface that as a
        # clean 400 instead of letting ProtectedError bubble up as a 500,
        # same pattern as LocationDetailAPIView.delete below.
        instance = self.get_object(pk)
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {"detail": "Can't delete — one or more assets still reference this department."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


# -------------------------------------------------------------- Locations --


class LocationListAPIView(APIView):
    """GET  — Locations page. Filter pills by type (?type=headquarters/
    branch_office/remote — ?type=all or an omitted param means every
    location), search by name/address (?search=, case-insensitive,
    combines with ?type=). Response is {"results": [...], "summary": {...}}
    rather than a bare list — `results` is the filtered set for the grid,
    `summary` is ALWAYS computed over every location (see
    location_summary()) so the tab counts and header stats stay correct
    regardless of which tab is currently selected.
    POST — Add Location."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Location
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = LocationFilter
    search_fields = ["name", "address"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def _context(self):
        # percent_of_fleet's denominator: total asset VALUE across every
        # location (not just this request's filtered subset) — see
        # LocationSerializer.get_percent_of_fleet.
        total_fleet_value = Asset.objects.aggregate(total=Sum("current_value"))["total"]
        return {"total_fleet_value": total_fleet_value or Decimal("0")}

    def get(self, request):
        queryset = self.filter_queryset(annotated_locations()).order_by("name")
        serializer = LocationSerializer(queryset, many=True, context=self._context())
        return Response({"results": serializer.data, "summary": location_summary()})

    def post(self, request):
        serializer = LocationSerializer(data=request.data, context=self._context())
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = annotated_locations().get(pk=instance.pk)
        return Response(
            LocationSerializer(instance, context=self._context()).data, status=status.HTTP_201_CREATED
        )


class LocationDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Location

    def _context(self):
        # Same key/shape as LocationListAPIView._context — percent_of_fleet
        # would silently render 0.0 here otherwise.
        total_fleet_value = Asset.objects.aggregate(total=Sum("current_value"))["total"]
        return {"total_fleet_value": total_fleet_value or Decimal("0")}

    def get_object(self, pk):
        return get_object_or_404(annotated_locations(), pk=pk)

    def get(self, request, pk):
        instance = self.get_object(pk)
        return Response(LocationSerializer(instance, context=self._context()).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        serializer = LocationSerializer(instance, data=request.data, partial=partial, context=self._context())
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = annotated_locations().get(pk=instance.pk)
        return Response(LocationSerializer(instance, context=self._context()).data)

    def delete(self, request, pk):
        # Asset.location is on_delete=PROTECT — surface that as a clean 400
        # instead of letting ProtectedError bubble up as a 500 (same as
        # assets.views.LocationDetailAPIView.delete).
        instance = self.get_object(pk)
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {"detail": "Can't delete — one or more assets still reference this location."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- Vendors --


def vendor_list_summary():
    """Type counts for the filter pills on the Vendors page, computed over all
    vendors regardless of filter state, to keep counts accurate."""
    type_counts = dict(
        Vendor.objects.order_by().values("vendor_type").annotate(c=Count("id")).values_list("vendor_type", "c")
    )
    return {
        "all": Vendor.objects.count(),
        "distributor": type_counts.get(Vendor.TYPE_DISTRIBUTOR, 0),
        "software_publisher": type_counts.get(Vendor.TYPE_SOFTWARE_PUBLISHER, 0),
        "marketplace": type_counts.get(Vendor.TYPE_MARKETPLACE, 0),
        "retailer": type_counts.get(Vendor.TYPE_RETAILER, 0),
    }


class VendorListAPIView(APIView):
    """GET  — Vendors page. Filter pills by type (?type=),
    search by name/email (?search=).
    POST — Add Vendor."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Vendor
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = VendorFilter
    search_fields = ["name", "email"]

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def _context(self):
        total_spend = Asset.objects.filter(vendor__isnull=False).aggregate(total=Sum("cost"))["total"]
        return {"total_spend": total_spend or Decimal("0")}

    def get(self, request):
        queryset = self.filter_queryset(annotated_vendors()).order_by("name")
        serializer = VendorSerializer(queryset, many=True, context=self._context())
        return Response({"results": serializer.data, "summary": vendor_list_summary()})

    def post(self, request):
        serializer = VendorSerializer(data=request.data, context=self._context())
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = annotated_vendors().get(pk=instance.pk)
        return Response(
            VendorSerializer(instance, context=self._context()).data, status=status.HTTP_201_CREATED
        )


class VendorDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Vendor

    def _context(self):
        total_spend = Asset.objects.filter(vendor__isnull=False).aggregate(total=Sum("cost"))["total"]
        return {"total_spend": total_spend or Decimal("0")}

    def get_object(self, pk):
        return get_object_or_404(annotated_vendors(), pk=pk)

    def get(self, request, pk):
        instance = self.get_object(pk)
        return Response(VendorSerializer(instance, context=self._context()).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        serializer = VendorSerializer(instance, data=request.data, partial=partial, context=self._context())
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        instance = annotated_vendors().get(pk=instance.pk)
        return Response(VendorSerializer(instance, context=self._context()).data)

    def delete(self, request, pk):
        # Asset.vendor is on_delete=SET_NULL — deleting a Vendor just
        # unlinks its asset(s). operations.PurchaseOrder.vendor DOES use
        # on_delete=PROTECT though (a PO's order history shouldn't
        # silently lose who it was ordered from), so this can still raise
        # ProtectedError once that app has data — surfaced as a clean 400,
        # same pattern as LocationDetailAPIView.delete above.
        instance = self.get_object(pk)
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {"detail": "Can't delete — one or more purchase orders still reference this vendor."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class VendorSummaryAPIView(APIView):
    """GET /api/organization/vendors/summary/ — page header stats for the
    Vendors page."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Vendor

    def get(self, request):
        total_vendors = Vendor.objects.count()
        vendor_assets = Asset.objects.filter(vendor__isnull=False)
        total_assets = vendor_assets.count()
        total_spend = vendor_assets.aggregate(total=Sum("cost"))["total"] or Decimal("0")

        return Response({
            "total_vendors": total_vendors,
            "total_assets": total_assets,
            "total_spend": str(total_spend),
        })


# ---------------------------------------------------------------- Summary --


class SummaryAPIView(APIView):
    """GET /api/organization/summary/ — header stats for the Employees,
    Locations, and Vendors pages, in one call."""
    permission_classes = [IsAuthenticated, ModelPermission]
    required_permissions = {"GET": ["assets.view_employee", "assets.view_location", "organization.view_vendor"]}

    def get(self, request):
        total_employees = Employee.objects.count()
        active_count = Employee.objects.filter(is_active=True).count()
        department_count = Department.objects.count()
        assigned_asset_count = Asset.objects.filter(assigned_to__isnull=False).count()
        avg_assets_per_employee = (
            round(assigned_asset_count / total_employees, 1) if total_employees else 0.0
        )

        total_assets = Asset.objects.count()

        vendor_assets = Asset.objects.filter(vendor__isnull=False)
        total_vendor_spend = vendor_assets.aggregate(total=Sum("cost"))["total"] or Decimal("0")

        return Response({
            "employees": {
                "total_employees": total_employees,
                "active_count": active_count,
                "department_count": department_count,
                "avg_assets_per_employee": avg_assets_per_employee,
            },
            "locations": {
                "total_locations": Location.objects.count(),
                "total_assets": total_assets,
                "total_employees": total_employees,
            },
            "vendors": {
                "total_vendors": Vendor.objects.count(),
                "total_assets": vendor_assets.count(),
                "total_spend": str(total_vendor_spend),
            },
        })
