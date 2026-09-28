
from datetime import date, timedelta

from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ModelPermission
from assets.models import Asset, Department

from .serializers import ReportAssetSerializer

# ─── constants ────────────────────────────────────────────────────────────────

MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

# Status order preserved from the existing frontend contract.
STATUS_ORDER = ["Assigned", "Available", "In Repair", "Reserved", "Maintenance"]


# ─── helpers ──────────────────────────────────────────────────────────────────

def _avg_age_label(avg_days: float) -> str:
    """
    Convert an average age in fractional days to a human-readable label that
    matches the format the frontend expects: "X.X yrs" or "X mo".
    """
    if avg_days >= 365:
        return f"{(avg_days / 365):.1f} yrs"
    return f"{round(avg_days / 30)} mo"


def _build_monthly_buckets(today: date):
    """
    Build the 12 trailing monthly buckets (oldest → newest) used for the
    acquisition trend.  Returns a list of dicts with label/year/month/value=0.
    """
    buckets = []
    for i in range(11, -1, -1):
        # Go back i months from the current month.
        month_offset = today.month - 1 - i  # 0-based month - offset
        year_offset = today.year + month_offset // 12
        month_1based = month_offset % 12 + 1
        buckets.append({
            "label": MONTH_NAMES[month_1based - 1],
            "year": year_offset,
            "month": month_1based,
            "value": 0,
        })
    return buckets


# ─── views ────────────────────────────────────────────────────────────────────

class ReportSummaryAPIView(APIView):
    """
    GET /api/reports/

    Returns the complete reports payload — all KPIs, all breakdowns, and the
    monthly acquisition trend — computed from the live database.

    No values are hardcoded.  All numbers come from Django ORM aggregation
    (Count, Sum) directly against the Asset, Department, and Category tables.

    Returns HTTP 200 on success.
    """
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Asset

    def get(self, request):
        today = date.today()
        # Plain queryset — used wherever we iterate over scalar fields only
        # (avg-age calculation, acquisition-trend window). Using select_related
        # here and then calling .only("purchase_date") raises a FieldError in
        # Django 5.x because the FK column can't be both deferred and traversed.
        plain_qs = Asset.objects.all()
        # FK-annotating queryset — used for grouped aggregations that need
        # category__name / department.name via the ORM.
        qs = Asset.objects.select_related("category", "department")

        # ── KPI: counts ──────────────────────────────────────────────────────
        total_assets = qs.count()
        assigned_count = qs.filter(status=Asset.STATUS_ASSIGNED).count()

        utilization_rate = (
            round((assigned_count / total_assets) * 100)
            if total_assets > 0 else 0
        )

        # ── KPI: financial ───────────────────────────────────────────────────
        financial = qs.aggregate(
            total_cost=Coalesce(Sum("cost"), 0, output_field=DecimalField()),
            total_value=Coalesce(Sum("current_value"), 0, output_field=DecimalField()),
        )
        total_cost = float(financial["total_cost"])
        total_value = float(financial["total_value"])

        depreciation_pct = (
            round(((total_cost - total_value) / total_cost) * 100)
            if total_cost > 0 else 0
        )

        # ── KPI: average asset age ────────────────────────────────────────────
        # Only assets with a purchase_date contribute; assets with NULL are excluded.
        # Uses plain_qs (no select_related) so .only("purchase_date") works safely.
        dated_qs = plain_qs.filter(purchase_date__isnull=False)
        dated_count = dated_qs.count()
        if dated_count > 0:
            total_days = sum(
                (today - a.purchase_date).days
                for a in dated_qs.only("purchase_date")
            )
            avg_age_label = _avg_age_label(total_days / dated_count)
        else:
            avg_age_label = "N/A"

        # ── KPI: warranty attention ───────────────────────────────────────────
        warranty_attention = qs.filter(
            Asset.warranty_q(Asset.WARRANTY_EXPIRING) | Asset.warranty_q(Asset.WARRANTY_EXPIRED)
        ).count()

        # ── Status breakdown ──────────────────────────────────────────────────
        counts_by_status = dict(
            qs.values_list("status").annotate(c=Count("id")).values_list("status", "c")
        )
        status_breakdown = [
            {"label": s, "count": counts_by_status.get(s, 0)}
            for s in STATUS_ORDER
        ]

        # ── Department breakdown ──────────────────────────────────────────────
        dept_qs = (
            Department.objects
            .annotate(asset_count=Count("assets"))
            .values("name", "asset_count")
            .order_by("-asset_count", "name")
        )
        department_breakdown = [
            {"label": d["name"], "count": d["asset_count"]}
            for d in dept_qs
        ]

        # ── Category breakdown ────────────────────────────────────────────────
        # Aggregates cost and current_value per category, 0-filled if no assets.
        cat_qs = (
            qs.values("category__name")
            .annotate(
                count=Count("id"),
                cost_sum=Coalesce(Sum("cost"), 0, output_field=DecimalField()),
                value_sum=Coalesce(Sum("current_value"), 0, output_field=DecimalField()),
            )
            .order_by("-count", "category__name")
        )
        category_breakdown = [
            {
                "label": row["category__name"],
                "count": row["count"],
                "cost": float(row["cost_sum"]),
                "value": float(row["value_sum"]),
            }
            for row in cat_qs
        ]

        # ── Warranty breakdown ────────────────────────────────────────────────
        # Derived from warranty_end_date where one is on file (Asset.warranty_q).
        warranty_breakdown = [
            {"label": label, "count": qs.filter(Asset.warranty_q(label)).count()}
            for label in [Asset.WARRANTY_ACTIVE, Asset.WARRANTY_EXPIRING, Asset.WARRANTY_EXPIRED]
        ]

        # ── Condition breakdown ───────────────────────────────────────────────
        counts_by_condition = dict(
            qs.values_list("condition").annotate(c=Count("id")).values_list("condition", "c")
        )
        condition_breakdown = [
            {"label": label, "count": counts_by_condition.get(label, 0)}
            for label in [Asset.CONDITION_GOOD, Asset.CONDITION_FAIR, Asset.CONDITION_POOR]
        ]

        # ── Acquisition trend (trailing 12 months) ────────────────────────────
        buckets = _build_monthly_buckets(today)

        # Fetch only assets that have a purchase_date within the trailing
        # 12-month window. Uses plain_qs (no select_related) so .only() is safe.
        window_start = date(buckets[0]["year"], buckets[0]["month"], 1)
        for asset in (
            plain_qs.filter(purchase_date__gte=window_start, purchase_date__lte=today)
            .only("purchase_date")
        ):
            pd = asset.purchase_date
            for bucket in buckets:
                if bucket["year"] == pd.year and bucket["month"] == pd.month:
                    bucket["value"] += 1
                    break

        total_acquired = sum(b["value"] for b in buckets)

        return Response({
            # KPIs
            "totalAssets": total_assets,
            "utilizationRate": utilization_rate,
            "totalValue": total_value,
            "totalCost": total_cost,
            "depreciationPct": depreciation_pct,
            "avgAgeLabel": avg_age_label,
            "warrantyAttention": warranty_attention,
            # Breakdowns
            "statusBreakdown": status_breakdown,
            "departmentBreakdown": department_breakdown,
            "categoryBreakdown": category_breakdown,
            "warrantyBreakdown": warranty_breakdown,
            "conditionBreakdown": condition_breakdown,
            # Acquisition trend
            "monthlyAcquisitions": buckets,
            "totalAcquired": total_acquired,
        })


class ReportAssetListAPIView(APIView):
    """
    GET /api/reports/assets/ — every asset in the Reports CSV field contract
    (tag, assignedTo, currentValue, purchaseDate, warranty). Read-only: asset
    create/update/delete live in /api/assets/ alone, which applies serial
    validation and audit logging.
    """
    permission_classes = [IsAuthenticated, ModelPermission]
    permission_model = Asset

    def get(self, request):
        queryset = Asset.objects.select_related("category", "department", "location", "assigned_to")
        return Response(ReportAssetSerializer(queryset, many=True).data)
