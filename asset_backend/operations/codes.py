from datetime import date

from .models import PurchaseOrder, Return


def next_po_number(order_date=None):
    """Generate the next po_number, e.g. 'PO-2026-004'.

    Prefix and format come from Settings > Purchase Orders
    (SystemSettings.po_prefix / po_number_format, defaults 'PO' and
    '{PREFIX}-{YEAR}-{NUMBER}'). With {YEAR} in the format the sequence
    resets per year. Scans existing numbers sharing the rendered prefix for
    the highest sequence, so a deleted order's number isn't reused — same
    approach as assets.codes.next_asset_code / organization.codes.next_employee_id."""
    from system_settings.services import get_system_settings, next_sequence, render_code_prefix

    order_date = order_date or date.today()
    s = get_system_settings()
    prefix = render_code_prefix(s.po_number_format, prefix=s.po_prefix, year=order_date.year)
    existing = PurchaseOrder.objects.filter(po_number__startswith=prefix).values_list(
        "po_number", flat=True
    )

    return f"{prefix}{next_sequence(existing, prefix, floor=0):03d}"


RETURN_NUMBER_PREFIX = "RET-"


def next_return_number():
    """Generate the next return_number, e.g. 'RET-007' — max(existing) + 1,
    so a deleted return's number isn't reused."""
    from system_settings.services import next_sequence

    existing = Return.objects.filter(return_number__startswith=RETURN_NUMBER_PREFIX).values_list(
        "return_number", flat=True
    )
    return f"{RETURN_NUMBER_PREFIX}{next_sequence(existing, RETURN_NUMBER_PREFIX, floor=0):03d}"
