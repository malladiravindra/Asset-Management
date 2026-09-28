import csv
from decimal import Decimal
import io

import pandas as pd
from django.db import transaction
from django.db.models import Count, ProtectedError, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ModelPermission
from aduitlog.models import AuditLog
from aduitlog.services import create_audit_log
from catalog.models import Category

from .codes import next_asset_code
from .filters import AssetFilter
from .models import Asset, Department, Location, Employee
from .serializers import AssetSerializer, AssetWriteSerializer, SERIAL_NUMBER_PATTERN

EXPORT_COLUMNS = [
    "asset_code", "name", "category", "serial_number", "department",
    "location", "assigned_to", "status", "condition", "cost", "warranty_status",
]

# Column names accepted in an import file, mapped to their Asset field name.
IMPORT_COLUMN_ALIASES = {
    "asset_code": "asset_code", "asset code": "asset_code",
    "name": "name",
    "category": "category",
    "serial_number": "serial_number", "serial number": "serial_number", "serial": "serial_number",
    "department": "department",
    "location": "location",
    "assigned_to": "assigned_to", "assigned to": "assigned_to",
    "status": "status",
    "condition": "condition",
    "cost": "cost",
    "warranty_status": "warranty_status", "warranty status": "warranty_status", "warranty": "warranty_status",
}


class AssetPagination(PageNumberPagination):
    """Same page size as the rest of the API (see REST_FRAMEWORK.PAGE_SIZE)
    — declared explicitly here so the Assets table view can override it
    per-request with ?page_size= without changing the site-wide default.
    Mirrors catalog/views.py's CatalogPagination."""
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class AssetOrderingFilter(filters.OrderingFilter):
    """?ordering=warranty_status sorts by the live, date-derived warranty
    status (the `live_warranty_status` annotation from AssetFilterMixin),
    not the stored column, which can lag once an end date passes."""

    ALIASES = {"warranty_status": "live_warranty_status"}

    def get_ordering(self, request, queryset, view):
        ordering = super().get_ordering(request, queryset, view)
        if not ordering:
            return ordering
        result = []
        for term in ordering:
            desc = term.startswith("-")
            name = term.lstrip("-")
            result.append(("-" if desc else "") + self.ALIASES.get(name, name))
        return result


class AssetFilterMixin:
    """Shared queryset + filtering for every Asset-related view that
    respects `?status=`/`?department=`/`?location=`/`?category=`/
    `?search=`/`?ordering=` — list, summary, and export all use the exact
    same filter_backends/filterset_class/search_fields/ordering_fields,
    replicating what GenericAPIView.filter_queryset() did for the old
    ViewSet. OrderingFilter is bundled in alongside Search/DjangoFilter the
    same way catalog/views.py's CatalogAPIView and operations/views.py's
    list views already do; `ordering_fields = []` here is the same
    explicit no-op default CatalogAPIView uses, so Summary/Export (which
    don't override it) stay unaffected by `?ordering=` unless they opt in."""
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, AssetOrderingFilter]
    filterset_class = AssetFilter
    search_fields = ["asset_code", "name", "serial_number", "assigned_to__name"]
    ordering_fields = []

    def get_queryset(self):
        return Asset.objects.select_related(
            "category", "brand", "model", "department", "location", "assigned_to"
        ).annotate(live_warranty_status=Asset.live_warranty_status_expression())

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset


class AssetListCreateAPIView(AssetFilterMixin, APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Asset
    pagination_class = AssetPagination
    # Whitelist of safe, legitimate scalar Asset fields `?ordering=`/
    # `?ordering=-field` may sort by — deliberately excludes FK fields
    # (category/brand/model/department/location/assigned_to/vendor) since
    # ordering by a related object's id isn't a meaningful sort and DRF's
    # OrderingFilter would otherwise allow `?ordering=category` to sort by
    # the raw category_id rather than anything the user actually sees.
    ordering_fields = [
        "asset_code",
        "name",
        "serial_number",
        "status",
        "condition",
        "cost",
        "current_value",
        "warranty_status",
        "purchase_date",
        "created_at",
        "updated_at",
    ]

    def get(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = AssetSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AssetWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Wrapped in one transaction so a failure recording the audit
        # entry rolls the asset creation back with it — the two are never
        # allowed to disagree (Rule: an audit entry must never exist for
        # an operation that ultimately failed/rolled back, and vice versa).
        with transaction.atomic():
            instance = serializer.save()
            create_audit_log(
                action=AuditLog.ACTION_CREATE,
                title=f"Asset {instance.asset_code} created ({instance.name})",
                actor=request.user,
            )
        return Response(AssetSerializer(instance).data, status=status.HTTP_201_CREATED)


class AssetDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Asset

    def get_object(self, pk):
        return get_object_or_404(
            Asset.objects.select_related(
                "category", "brand", "model", "department", "location", "assigned_to"
            ),
            pk=pk,
        )

    def get(self, request, pk):
        instance = self.get_object(pk)
        serializer = AssetSerializer(instance)
        return Response(serializer.data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        instance = self.get_object(pk)
        previous_status = instance.status
        previous_assigned_to = instance.assigned_to.name if instance.assigned_to else None

        serializer = AssetWriteSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            instance = serializer.save()
            self._log_update(request, instance, previous_status, previous_assigned_to)
        return Response(AssetSerializer(instance).data)

    def _log_update(self, request, instance, previous_status, previous_assigned_to):
        """Same ASSIGN / RETURN / UPDATE classification the frontend used
        to compute client-side from a before/after status diff (see the
        removed logEvent() calls in Asset-Management's assets/table.tsx) —
        now computed server-side, from real committed data, so the audit
        trail is correct regardless of which client made the request."""
        new_assigned_to = instance.assigned_to.name if instance.assigned_to else None
        department_name = instance.department.name if instance.department_id else ""

        if (
            instance.status == Asset.STATUS_ASSIGNED
            and previous_status != Asset.STATUS_ASSIGNED
            and new_assigned_to
        ):
            create_audit_log(
                action=AuditLog.ACTION_ASSIGN,
                title=f"{instance.asset_code} assigned to {new_assigned_to}",
                actor=request.user,
                context=department_name,
            )
        elif (
            previous_status == Asset.STATUS_ASSIGNED
            and instance.status != Asset.STATUS_ASSIGNED
            and previous_assigned_to
        ):
            create_audit_log(
                action=AuditLog.ACTION_RETURN,
                title=f"{instance.asset_code} returned by {previous_assigned_to}",
                actor=request.user,
                context=department_name,
            )
        elif previous_status != instance.status:
            create_audit_log(
                action=AuditLog.ACTION_UPDATE,
                title=f"{instance.asset_code} status changed to {instance.status}",
                actor=request.user,
            )
        else:
            create_audit_log(
                action=AuditLog.ACTION_UPDATE,
                title=f"Asset {instance.asset_code} updated",
                actor=request.user,
            )

    def delete(self, request, pk):
        # operations.Assignment.asset is on_delete=PROTECT (an asset's
        # assignment/return history shouldn't silently vanish) — surface
        # that as a clean 400 instead of an unhandled 500.
        instance = self.get_object(pk)
        asset_code = instance.asset_code
        try:
            with transaction.atomic():
                instance.delete()
                create_audit_log(
                    action=AuditLog.ACTION_DELETE,
                    title=f"Asset {asset_code} deleted",
                    actor=request.user,
                )
        except ProtectedError:
            return Response(
                {"detail": "Can't delete — this asset still has assignment history. Remove its assignments first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetSummaryAPIView(AssetFilterMixin, APIView):
    """GET /api/assets/summary/ — respects the same ?status=/?department=/
    ?location=/?category=/?search= filters as the list endpoint (see
    AssetFilterMixin), so a filtered dashboard view gets consistent totals.

    status_breakdown always lists every status in Asset.STATUS_CHOICES
    (zero-filled, not just the ones present in this filtered set) so the
    frontend's status donut/legend doesn't have to reconcile a partial
    list against the full choice set itself."""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Asset

    def get(self, request):
        qs = self.filter_queryset(self.get_queryset())
        counts_by_status = dict(
            qs.values_list("status").annotate(c=Count("id")).values_list("status", "c")
        )
        totals = qs.aggregate(total_cost=Sum("cost"), total_current_value=Sum("current_value"))
        return Response({
            "total_assets": qs.count(),
            "category_count": qs.values("category").distinct().count(),
            "status_breakdown": [
                {"status": choice, "count": counts_by_status.get(choice, 0)}
                for choice, _label in Asset.STATUS_CHOICES
            ],
            "total_cost": str(totals["total_cost"] or 0),
            "total_current_value": str(totals["total_current_value"] or 0),
        })


class CSVFileRenderer(BaseRenderer):
    """Registered purely so DRF's content negotiation accepts
    ?format=csv instead of 404ing — see the comment on AssetExportAPIView.
    render() is never actually called: the view always builds and returns
    its own HttpResponse directly, bypassing DRF's renderer pipeline."""
    media_type = "text/csv"
    format = "csv"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class XLSXFileRenderer(BaseRenderer):
    """Same as CSVFileRenderer, for ?format=xlsx."""
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    format = "xlsx"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class AssetExportAPIView(AssetFilterMixin, APIView):
    """GET — download the (filtered) asset list as CSV/XLSX. Requires an
    authenticated user like every other Asset endpoint: the frontend
    downloads through lib/api.ts apiDownload(), which sends the JWT
    Authorization header, so there is no need for an open download link.
    (Tighten to a role permission once Roles & Permissions exists.)"""
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Asset
    # DRF's DefaultContentNegotiation treats the `format` query param
    # (URL_FORMAT_OVERRIDE) as a request for one of renderer_classes'
    # registered `.format` values — anything else raises Http404 in
    # rest_framework/negotiation.py's filter_renderers() *before* get()
    # below ever runs. Registering these two here (instead of the default
    # JSONRenderer/BrowsableAPIRenderer) is what makes ?format=xlsx and
    # ?format=csv resolve instead of 404ing.
    renderer_classes = [CSVFileRenderer, XLSXFileRenderer]

    def get(self, request):
        qs = self.filter_queryset(self.get_queryset())
        rows = [
            {
                "asset_code": a.asset_code,
                "name": a.name,
                "category": a.category.name,
                "serial_number": a.serial_number,
                "department": a.department.name,
                "location": a.location.name,
                "assigned_to": a.assigned_to.name if a.assigned_to else "",
                "status": a.status,
                "condition": a.condition,
                "cost": str(a.cost),
                "warranty_status": a.current_warranty_status,
            }
            for a in qs
        ]

        # Accept both the documented `format` param (the standard DRF
        # URL_FORMAT_OVERRIDE name — now safe to read thanks to
        # renderer_classes above) and `file_format` (kept for any existing
        # caller/test using the old name). `file_format` wins if somehow
        # both are sent.
        file_format = (
            request.query_params.get("file_format")
            or request.query_params.get("format")
            or "csv"
        ).lower()

        if file_format == "xlsx":
            df = pd.DataFrame(rows, columns=EXPORT_COLUMNS)
            buffer = io.BytesIO()
            df.to_excel(buffer, index=False, sheet_name="Assets")
            buffer.seek(0)
            response = HttpResponse(
                buffer.read(),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = 'attachment; filename="assets.xlsx"'
            return response

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="assets.csv"'
        writer = csv.DictWriter(response, fieldnames=EXPORT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
        return response


class AssetImportAPIView(APIView):
    permission_classes = [IsAuthenticated, ModelPermission]
    required_permissions = {"POST": ["assets.add_asset", "assets.change_asset"]}

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "No file uploaded. Send it as 'file'."},
                             status=status.HTTP_400_BAD_REQUEST)

        try:
            if upload.name.lower().endswith(".csv"):
                df = pd.read_csv(upload)
            else:
                df = pd.read_excel(upload)
        except Exception as exc:
            return Response({"detail": f"Could not parse file: {exc}"},
                             status=status.HTTP_400_BAD_REQUEST)

        df.columns = [str(c).strip().lower() for c in df.columns]
        unknown_columns = [c for c in df.columns if c not in IMPORT_COLUMN_ALIASES]
        df = df.rename(columns=IMPORT_COLUMN_ALIASES)

        required = {"name", "category", "serial_number", "department", "location", "cost"}
        missing = required - set(df.columns)
        if missing:
            return Response(
                {"detail": f"Missing required column(s): {', '.join(sorted(missing))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created, updated, errors = 0, 0, []

        for i, row in df.iterrows():
            row_num = i + 2  # +1 for 0-index, +1 for header row
            try:
                name_val = str(row.get("name") or "").strip()
                if not name_val or name_val.lower() == "nan":
                    raise ValueError("Asset name cannot be blank.")

                cat_val = str(row.get("category") or "").strip()
                if not cat_val or cat_val.lower() == "nan":
                    raise ValueError("Category cannot be blank.")

                dept_val = str(row.get("department") or "").strip()
                if not dept_val or dept_val.lower() == "nan":
                    raise ValueError("Department cannot be blank.")

                loc_val = str(row.get("location") or "").strip()
                if not loc_val or loc_val.lower() == "nan":
                    raise ValueError("Location cannot be blank.")

                raw_serial = str(row.get("serial_number") or "").strip().upper()
                if not raw_serial or raw_serial.lower() == "nan":
                    raise ValueError("Serial number cannot be blank.")
                if not SERIAL_NUMBER_PATTERN.match(raw_serial):
                    raise ValueError(
                        f"Serial number '{raw_serial}' must follow format: 2 letters + digits, e.g. DL123456789."
                    )

                raw_cost = str(row.get("cost") or "").replace("$", "").replace("₹", "").replace(",", "").strip()
                try:
                    cost_val = Decimal(raw_cost)
                    if cost_val <= 0:
                        raise ValueError("Cost must be a positive number.")
                except Exception:
                    raise ValueError(f"Invalid cost '{row.get('cost')}'. Must be a positive number.")

                with transaction.atomic():
                    category, _ = Category.objects.get_or_create(name=cat_val)
                    department, _ = Department.objects.get_or_create(name=dept_val)
                    location, _ = Location.objects.get_or_create(name=loc_val)

                    assigned_to = None
                    assignee_name = str(row.get("assigned_to") or "").strip()
                    if assignee_name and assignee_name.lower() != "nan":
                        assigned_to, _ = Employee.objects.get_or_create(name=assignee_name)

                    status_val = str(row.get("status") or "").strip()
                    if not status_val or status_val.lower() == "nan":
                        status_val = Asset.STATUS_AVAILABLE

                    condition_val = str(row.get("condition") or "").strip()
                    if not condition_val or condition_val.lower() == "nan":
                        condition_val = Asset.CONDITION_GOOD

                    warranty_val = str(row.get("warranty_status") or "").strip()
                    if not warranty_val or warranty_val.lower() == "nan":
                        warranty_val = Asset.WARRANTY_ACTIVE

                    asset_code = str(row.get("asset_code") or "").strip()
                    if asset_code.lower() == "nan":
                        asset_code = ""

                    # Find existing asset by asset_code or serial_number
                    existing_asset = None
                    if asset_code:
                        existing_asset = Asset.objects.filter(asset_code=asset_code).first()
                    if not existing_asset:
                        existing_asset = Asset.objects.filter(serial_number=raw_serial).first()

                    if existing_asset:
                        existing_asset.name = name_val
                        existing_asset.category = category
                        existing_asset.serial_number = raw_serial
                        existing_asset.department = department
                        existing_asset.location = location
                        existing_asset.assigned_to = assigned_to
                        existing_asset.cost = cost_val
                        existing_asset.status = status_val
                        existing_asset.condition = condition_val
                        existing_asset.warranty_status = warranty_val
                        existing_asset.full_clean()
                        existing_asset.save()
                        updated += 1
                        create_audit_log(
                            action=AuditLog.ACTION_UPDATE,
                            title=f"Asset {existing_asset.asset_code} updated via import",
                            actor=request.user,
                        )
                    else:
                        if not asset_code:
                            asset_code = next_asset_code(category)
                        new_asset = Asset.objects.create(
                            asset_code=asset_code,
                            name=name_val,
                            category=category,
                            serial_number=raw_serial,
                            department=department,
                            location=location,
                            assigned_to=assigned_to,
                            cost=cost_val,
                            status=status_val,
                            condition=condition_val,
                            warranty_status=warranty_val,
                        )
                        created += 1
                        create_audit_log(
                            action=AuditLog.ACTION_CREATE,
                            title=f"Asset {new_asset.asset_code} created via import ({new_asset.name})",
                            actor=request.user,
                        )
            except Exception as exc:
                errors.append({"row": row_num, "reason": str(exc)})

        return Response({
            "created": created,
            "updated": updated,
            "failed": len(errors),
            "errors": errors,
            "total": len(df),
            "ignored_columns": unknown_columns,
        }, status=status.HTTP_200_OK if not errors else status.HTTP_207_MULTI_STATUS)
