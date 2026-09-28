"""
Dashboard API — a single, read-only aggregation endpoint backing the
frontend's Dashboard page (asset-management/src/app/dashboard/page.tsx).

Everything returned here is computed live via Django ORM aggregation
against models that already exist elsewhere in the project — Asset/
Department (assets app), Category (catalog app), MaintenanceRecord/
RepairRecord (operation app), and AuditLog (aduitlog app). No new model,
no duplicated business logic, no hardcoded numbers: this view only reuses
and aggregates what other apps already store.
"""
import datetime

from django.db.models import Count, F, Sum
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ModelPermission
from aduitlog.models import AuditLog
from assets.models import Asset, Department
from catalog.models import Category
from operation.models import Accessory, MaintenanceRecord, RepairRecord, SoftwareLicense
from operation.services import OPEN_MAINTENANCE_STATUSES, OPEN_REPAIR_STATUSES


def _pct(part, total):
    """Safe percentage helper — never divides by zero; matches the same
    zero-total guard AssetSummaryAPIView/reports.ReportSummaryAPIView
    already use elsewhere in this project (`if total > 0 else 0`)."""
    return round((part / total) * 100) if total else 0


class DashboardAPIView(APIView):
    """
    GET /api/dashboard/

    Read-only. Requires a valid JWT (IsAuthenticated, same as every other
    data endpoint in this project — see REST_FRAMEWORK.DEFAULT_PERMISSION_CLASSES
    in settings.py).

    Counting rules deliberately mirror what the frontend dashboard page
    currently computes client-side (see DashboardPage in page.tsx), now
    computed server-side from the live database instead:
      - available_count / assigned_count  -> Asset.status, from one grouped
                                              query (same pattern
                                              AssetSummaryAPIView already
                                              uses for its status_breakdown).
      - under_service_count               -> open (not Completed/Cancelled)
                                              MaintenanceRecord + RepairRecord
                                              rows — exactly the frontend's
                                              openMaintenance + openRepairs
                                              sum, computed server-side.
                                              ("Overdue" on the frontend is
                                              just a display label for an
                                              open row past its scheduled
                                              date — it's still open here.)
      - warranty_alerts_count              -> Asset.warranty_status == "Expiring",
                                              matching the frontend's
                                              warrantyAlerts filter exactly.
      - warranty_alerts                    -> the actual Expiring assets
                                              (asset_code/name/status/
                                              warranty_status only — the
                                              Asset model has no real
                                              warranty end-date column, so
                                              this deliberately does not
                                              fabricate a "days left"
                                              number), capped to keep the
                                              summary endpoint lightweight
                                              (same idea as recent_activity
                                              below being capped to 5).
      - total_current_value                -> Sum(Asset.current_value).
      - total_purchase_cost                -> Sum(Asset.cost), from the same
                                              aggregate query.
      - by_department / by_status          -> zero-filled breakdowns with a
                                              safe (never divide-by-zero)
                                              percentage.
      - by_category                        -> per-category asset counts.
      - recent_activity                    -> the 5 most recent AuditLog
                                              rows (the existing audit
                                              trail — no second activity/log
                                              model is introduced).
      - attention                          -> record counts behind the
                                              sidebar's Service/Accessories
                                              badges (overdue open
                                              maintenance/repairs, licenses
                                              expiring within 30 days or
                                              expired, accessories at or
                                              below their reorder threshold).
                                              A business summary — not
                                              notifications, which are
                                              per-user rows in /api/notifications/.
    """
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Asset

    def get(self, request):
        # ── Asset counts + status breakdown (one grouped query, no N+1) ────
        total_assets = Asset.objects.count()
        counts_by_status = dict(
            Asset.objects.values_list("status")
            .annotate(c=Count("id"))
            .values_list("status", "c")
        )
        available_count = counts_by_status.get(Asset.STATUS_AVAILABLE, 0)
        assigned_count = counts_by_status.get(Asset.STATUS_ASSIGNED, 0)

        by_status = [
            {
                "status": choice,
                "count": counts_by_status.get(choice, 0),
                "percentage": _pct(counts_by_status.get(choice, 0), total_assets),
            }
            for choice, _label in Asset.STATUS_CHOICES
        ]

        # ── Under-service: open Maintenance + open Repair jobs ─────────────
        open_maintenance = MaintenanceRecord.objects.exclude(
            status__in=[MaintenanceRecord.STATUS_COMPLETED, MaintenanceRecord.STATUS_CANCELLED]
        ).count()
        open_repairs = RepairRecord.objects.exclude(
            status__in=[RepairRecord.STATUS_COMPLETED, RepairRecord.STATUS_CANCELLED]
        ).count()
        under_service_count = open_maintenance + open_repairs

        # ── Warranty alerts ──────────────────────────────────────────────────
        # Expiring = warranty_end_date within Asset.WARRANTY_EXPIRING_DAYS
        # (or, for assets with no end date on file, the stored status).
        expiring_qs = Asset.objects.filter(Asset.warranty_q(Asset.WARRANTY_EXPIRING))
        warranty_alerts_count = expiring_qs.count()
        # days_left comes from the real warranty_end_date (None when the
        # asset has no end date on file). Capped at 20 for the same reason
        # recent_activity is capped at 5: this is a summary endpoint.
        warranty_alerts = [
            {
                "asset_code": a.asset_code,
                "name": a.name,
                "status": a.status,
                "warranty_status": a.current_warranty_status,
                "warranty_end_date": a.warranty_end_date,
                "days_left": a.warranty_days_remaining,
            }
            for a in expiring_qs.order_by(F("warranty_end_date").asc(nulls_last=True), "asset_code")[:20]
        ]

        # ── Financial ────────────────────────────────────────────────────────
        totals = Asset.objects.aggregate(current=Sum("current_value"), cost=Sum("cost"))
        total_current_value = totals["current"] or 0
        total_purchase_cost = totals["cost"] or 0

        # ── Department breakdown (every Department listed, zero-filled) ────
        dept_rows = (
            Department.objects.annotate(asset_count=Count("assets"))
            .values("name", "asset_count")
            .order_by("-asset_count", "name")
        )
        by_department = [
            {
                "department_name": row["name"],
                "asset_count": row["asset_count"],
                "percentage": _pct(row["asset_count"], total_assets),
            }
            for row in dept_rows
        ]

        # ── Category breakdown ───────────────────────────────────────────────
        cat_rows = (
            Category.objects.annotate(asset_count=Count("assets"))
            .values("name", "asset_count")
            .order_by("-asset_count", "name")
        )
        by_category = [
            {"category_name": row["name"], "asset_count": row["asset_count"]}
            for row in cat_rows
        ]

        # ── Recent activity: reuse the existing AuditLog model/trail ───────
        # AuditLog.Meta.ordering is already ["-timestamp"], so this is just
        # the 5 most recent rows. Audit history is itself permission-gated
        # (aduitlog.view_auditlog), so a user without it gets an empty list
        # here rather than a side door into the log.
        recent_activity = [
            {
                "title": log.title,
                "action": log.action,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in AuditLog.objects.all()[:5]
        ] if request.user.has_perm("aduitlog.view_auditlog") else []

        # ── Attention counts (sidebar badges) — same rules as the overdue /
        # expiring / low-stock labels the frontend tables show.
        today = datetime.date.today()
        attention = {
            "overdue_maintenance_count": MaintenanceRecord.objects.filter(
                status__in=OPEN_MAINTENANCE_STATUSES, scheduled_date__lt=today
            ).count(),
            "overdue_repair_count": RepairRecord.objects.filter(
                status__in=OPEN_REPAIR_STATUSES, expected_return_date__lt=today
            ).count(),
            "licenses_attention_count": SoftwareLicense.objects.exclude(
                license_type=SoftwareLicense.TYPE_PERPETUAL
            ).filter(expiry_date__isnull=False, expiry_date__lte=today + datetime.timedelta(days=30)).count(),
            "low_stock_accessories_count": Accessory.objects.filter(
                total_qty__lte=F("assigned_qty") + F("reorder_threshold")
            ).count(),
        }

        return Response({
            "total_assets": total_assets,
            "available_count": available_count,
            "assigned_count": assigned_count,
            "under_service_count": under_service_count,
            "warranty_alerts_count": warranty_alerts_count,
            "warranty_alerts": warranty_alerts,
            "total_current_value": float(total_current_value),
            "total_purchase_cost": float(total_purchase_cost),
            "by_department": by_department,
            "by_status": by_status,
            "by_category": by_category,
            "recent_activity": recent_activity,
            "attention": attention,
        })
