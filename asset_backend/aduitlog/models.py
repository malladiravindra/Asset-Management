from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """One immutable record of "something happened" across the Asset
    Management system — the backend source of truth for the Audit Logs
    page (Asset-Management/src/components/audit-logs/). Rows are created
    server-side, after the underlying operation has already succeeded (see
    aduitlog.services.create_audit_log and its callers in assets/views.py
    and operations/services.py) — never from raw client input for `actor`.

    Field shape mirrors the frontend's existing AuditLogEntry type
    (components/audit-logs/data.ts) exactly: action / title / actor /
    context / timestamp — so the API response needs no reshaping beyond
    JSON key names.
    """

    ACTION_CREATE = "CREATE"
    ACTION_UPDATE = "UPDATE"
    ACTION_ASSIGN = "ASSIGN"
    ACTION_RETURN = "RETURN"
    ACTION_DELETE = "DELETE"
    # Recorded by accounts.views LoginView/LogoutView when Settings > Audit
    # Logs > Track Login / Track Logout are enabled.
    ACTION_LOGIN = "LOGIN"
    ACTION_LOGOUT = "LOGOUT"
    ACTION_CHOICES = [
        (ACTION_CREATE, "Create"),
        (ACTION_UPDATE, "Update"),
        (ACTION_ASSIGN, "Assign"),
        (ACTION_RETURN, "Return"),
        (ACTION_DELETE, "Delete"),
        (ACTION_LOGIN, "Login"),
        (ACTION_LOGOUT, "Logout"),
    ]

    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    title = models.CharField(max_length=255)

    # Nullable + SET_NULL so deleting a user account never deletes the
    # history of what they did. `actor_name` below is a permanent snapshot
    # of their display name taken at write time specifically so the audit
    # trail keeps reading correctly even after the account is renamed or
    # removed — the FK is kept as the live/queryable link, actor_name is
    # what the API actually returns as the frontend's `actor: string`.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )
    actor_name = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text="Snapshot of the actor's display name at the time of the event.",
    )

    context = models.CharField(max_length=255, blank=True, default="")

    # auto_now_add: server/database is the sole source of truth for when an
    # event happened — never accepted from the client (see serializers.py).
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["-timestamp"], name="auditlog_timestamp_idx"),
            models.Index(fields=["action", "-timestamp"], name="auditlog_action_idx"),
            models.Index(fields=["actor", "-timestamp"], name="auditlog_actor_idx"),
        ]

    def __str__(self):
        return f"[{self.action}] {self.title}"

    @property
    def display_actor(self):
        """The name the API should show for this entry. Falls back to the
        live actor's own display name for any row where actor_name wasn't
        populated (shouldn't happen going forward, but keeps old/edge-case
        rows from showing a blank actor), then to "System" if the account
        is gone and no snapshot was ever taken."""
        if self.actor_name:
            return self.actor_name
        if self.actor_id and self.actor:
            return self.actor.get_full_name() or self.actor.username
        return "System"
