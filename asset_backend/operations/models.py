from decimal import Decimal

from django.db import models

# Purchase Orders, Assignments, and Returns — the Operations module.
#
# Deliberately reuses assets.Asset/Department/Employee and organization.Vendor
# by ForeignKey rather than duplicating their fields (name, tag, etc.) —
# every "assetName"/"employeeName"/"vendor" style field the frontend needs
# is derived at serialization time from these relations (see serializers.py),
# never stored redundantly here.


class PurchaseOrder(models.Model):
    STATUS_DRAFT = "Draft"
    STATUS_PENDING_APPROVAL = "Pending Approval"
    STATUS_APPROVED = "Approved"
    STATUS_ORDERED = "Ordered"
    STATUS_PARTIALLY_RECEIVED = "Partially Received"
    STATUS_RECEIVED = "Received"
    STATUS_CANCELLED = "Cancelled"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_PENDING_APPROVAL, "Pending Approval"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_ORDERED, "Ordered"),
        (STATUS_PARTIALLY_RECEIVED, "Partially Received"),
        (STATUS_RECEIVED, "Received"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    # Server-generated, e.g. "PO-2026-001" — see operations.codes.next_po_number.
    po_number = models.CharField(max_length=30, unique=True, editable=False)
    vendor = models.ForeignKey(
        "organization.Vendor", on_delete=models.PROTECT, related_name="purchase_orders"
    )
    department = models.ForeignKey(
        "assets.Department", on_delete=models.PROTECT, related_name="purchase_orders"
    )
    requested_by = models.ForeignKey(
        "assets.Employee", on_delete=models.PROTECT, related_name="purchase_orders"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    order_date = models.DateField(auto_now_add=True)
    expected_date = models.DateField()
    received_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    # GST rate (%) applied to this order's line-item subtotal — the Add
    # Purchase Order form already computes and shows a tax amount from a
    # user-chosen rate, but neither the rate nor the resulting tax had a
    # backend column; both were kept in frontend-only state and lost on
    # reload. `tax`/`subtotal`/`total` stay computed (see
    # PurchaseOrderSerializer), not stored, so they can never drift from
    # gst_rate x the actual line items.
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, default=Decimal("0"))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-order_date", "-id"]

    def __str__(self):
        return self.po_number


class PurchaseOrderItem(models.Model):
    """One line item on a PurchaseOrder. name/category are a free-text
    snapshot of the catalog item picked at order time (matching the Add
    Purchase Order form's item picker), not a live FK — a PO should keep
    showing what was actually ordered even if that catalog entry is later
    renamed or removed."""

    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=100, blank=True, default="")
    quantity = models.PositiveIntegerField()
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} x{self.quantity}"


class Assignment(models.Model):
    """One stint of a single Asset being held by a single Employee, from
    assigned_date until returned (see Return below). A new assignment cycle
    for the same asset (different employee, or the same employee again after
    a return) is always a NEW Assignment row — assignment history is never
    overwritten in place, so past custody periods stay intact."""

    STATUS_ASSIGNED = "Assigned"
    STATUS_UNASSIGNED = "Unassigned"
    STATUS_CHOICES = [
        (STATUS_ASSIGNED, "Assigned"),
        (STATUS_UNASSIGNED, "Unassigned"),
    ]

    asset = models.ForeignKey("assets.Asset", on_delete=models.PROTECT, related_name="assignments")
    # Field kept as `person` (not renamed to `employee`) — out of scope for
    # the Person->Employee model rename; only the FK's target class changed.
    person = models.ForeignKey("assets.Employee", on_delete=models.PROTECT, related_name="assignments")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_ASSIGNED)
    assigned_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-assigned_date", "-id"]

    def __str__(self):
        return f"{self.asset_id} -> {self.person_id} ({self.status})"


class Return(models.Model):
    """The outcome of ending one Assignment. Referenced 1:1 by `assignment`
    rather than folded into the Assignment row itself, so "was this
    assignment ever returned, and how" stays a separate, addressable fact —
    exactly what /api/operations/returns/ lists. condition/reason are
    optional so a plain "Unassign" (Assignments page's quick action, which
    collects no condition/reason) and a full "Process Return" (Returns
    page's form, which always sends both) both produce one consistent
    Return + Assignment state transition."""

    CONDITION_EXCELLENT = "Excellent"
    CONDITION_GOOD = "Good"
    CONDITION_FAIR = "Fair"
    CONDITION_POOR = "Poor"
    CONDITION_CHOICES = [
        (CONDITION_EXCELLENT, "Excellent"),
        (CONDITION_GOOD, "Good"),
        (CONDITION_FAIR, "Fair"),
        (CONDITION_POOR, "Poor"),
    ]

    # Server-generated on first save, e.g. "RET-007" (operations.codes.next_return_number).
    return_number = models.CharField(max_length=20, unique=True, null=True, blank=True, editable=False)
    assignment = models.OneToOneField(Assignment, on_delete=models.CASCADE, related_name="return_record")
    return_date = models.DateField()
    condition = models.CharField(max_length=10, choices=CONDITION_CHOICES, null=True, blank=True)
    reason = models.CharField(max_length=100, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-return_date", "-id"]

    def __str__(self):
        return f"Return for assignment {self.assignment_id}"

    def save(self, *args, **kwargs):
        """return_number is generated on first save and retried if a
        concurrent return claimed the same number (it is unique)."""
        if self.return_number:
            return super().save(*args, **kwargs)
        from django.db import IntegrityError, transaction

        from .codes import next_return_number

        for attempt in range(5):
            self.return_number = next_return_number()
            try:
                with transaction.atomic():
                    return super().save(*args, **kwargs)
            except IntegrityError:
                if attempt == 4:
                    raise
