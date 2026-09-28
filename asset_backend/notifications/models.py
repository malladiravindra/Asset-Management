from django.conf import settings
from django.db import models


class Notification(models.Model):
    """One in-app notification for one user — the single source of truth for
    the bell, the sidebar badge and the Notifications page. Rows are created
    only by notifications.services (from backend business events and the
    generate_notifications command), never from client input.

    dedupe_key identifies the event ("repair_status:12:Completed"); the
    unique (recipient, dedupe_key) constraint makes the database itself
    refuse a second copy of the same event for the same user, however many
    times the event fires or the command runs."""

    TYPE_ASSIGNMENT_CREATED = "assignment_created"
    TYPE_RETURN_PROCESSED = "return_processed"
    TYPE_REPAIR_STATUS_CHANGED = "repair_status_changed"
    TYPE_MAINTENANCE_STATUS_CHANGED = "maintenance_status_changed"
    TYPE_PURCHASE_ORDER_STATUS_CHANGED = "purchase_order_status_changed"
    TYPE_WARRANTY_EXPIRING = "warranty_expiring"
    TYPE_WARRANTY_EXPIRED = "warranty_expired"
    TYPE_MAINTENANCE_OVERDUE = "maintenance_overdue"
    TYPE_REPAIR_OVERDUE = "repair_overdue"
    TYPE_LICENSE_EXPIRING = "license_expiring"
    TYPE_LICENSE_EXPIRED = "license_expired"
    TYPE_CHOICES = [
        (TYPE_ASSIGNMENT_CREATED, "Assignment created"),
        (TYPE_RETURN_PROCESSED, "Return processed"),
        (TYPE_REPAIR_STATUS_CHANGED, "Repair status changed"),
        (TYPE_MAINTENANCE_STATUS_CHANGED, "Maintenance status changed"),
        (TYPE_PURCHASE_ORDER_STATUS_CHANGED, "Purchase order status changed"),
        (TYPE_WARRANTY_EXPIRING, "Warranty expiring"),
        (TYPE_WARRANTY_EXPIRED, "Warranty expired"),
        (TYPE_MAINTENANCE_OVERDUE, "Maintenance overdue"),
        (TYPE_REPAIR_OVERDUE, "Repair overdue"),
        (TYPE_LICENSE_EXPIRING, "License expiring"),
        (TYPE_LICENSE_EXPIRED, "License expired"),
    ]

    PRIORITY_LOW = "low"
    PRIORITY_NORMAL = "normal"
    PRIORITY_HIGH = "high"
    PRIORITY_CHOICES = [
        (PRIORITY_LOW, "Low"),
        (PRIORITY_NORMAL, "Normal"),
        (PRIORITY_HIGH, "High"),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    type = models.CharField(max_length=40, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200)
    message = models.CharField(max_length=500, blank=True, default="")
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_NORMAL)
    # What the notification is about, e.g. ("asset", 12) — a reference, not
    # a copy: the frontend links through action_url to the live record.
    target_type = models.CharField(max_length=40, blank=True, default="")
    target_id = models.PositiveBigIntegerField(null=True, blank=True)
    action_url = models.CharField(max_length=200, blank=True, default="")
    dedupe_key = models.CharField(max_length=200)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["recipient", "dedupe_key"], name="notification_recipient_dedupe_uniq"),
        ]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"], name="notification_inbox_idx"),
        ]

    def __str__(self):
        return f"[{self.type}] {self.title} -> {self.recipient_id}"
