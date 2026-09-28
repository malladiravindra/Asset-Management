from decimal import Decimal

from django.db.models import Count, DecimalField, IntegerField, OuterRef, Subquery, Sum
from django.db.models.functions import Coalesce

# Same reasoning as catalog.views._subquery_count/_subquery_value_sum:
# Location needs counts across TWO different reverse relations at once
# (assets AND employees) — a single joined annotate(Count(...), Count(...))
# over two different relations multiplies rows against each other (the
# classic Django "fan-out" bug) and silently inflates both counts.
# Independent correlated subqueries side-step that, still in one query.


def subquery_count(model, fk_name, extra_filter=None):
    qs = model.objects.filter(**{fk_name: OuterRef("pk")})
    if extra_filter:
        qs = qs.filter(**extra_filter)
    qs = qs.order_by().values(fk_name)
    return Coalesce(
        Subquery(qs.annotate(c=Count("id")).values("c"), output_field=IntegerField()), 0
    )


def subquery_sum(model, fk_name, value_field, extra_filter=None):
    qs = model.objects.filter(**{fk_name: OuterRef("pk")})
    if extra_filter:
        qs = qs.filter(**extra_filter)
    qs = qs.order_by().values(fk_name)
    return Coalesce(
        Subquery(
            qs.annotate(s=Sum(value_field)).values("s"),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        ),
        Decimal("0"),
    )
