from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    """Read shape — exactly the fields the frontend's AuditLogEntry type
    needs (components/audit-logs/data.ts): id / action / title / actor /
    context / timestamp. `actor` is always a plain display-name string
    (never the internal user id/FK), matching the frontend contract even
    though it's backed by a ForeignKey + snapshot on the model."""

    actor = serializers.CharField(source="display_actor", read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "action", "title", "actor", "context", "timestamp"]
        read_only_fields = fields


class AuditLogWriteSerializer(serializers.ModelSerializer):
    """Create/update shape. Deliberately has NO `actor` or `timestamp`
    field — actor is always the authenticated request.user (set by the
    view via aduitlog.services.create_audit_log), never client-submitted,
    so an authenticated caller can't impersonate another user by sending
    an arbitrary actor value. timestamp is server/database-generated
    (auto_now_add) and likewise never accepted from the client."""

    class Meta:
        model = AuditLog
        fields = ["action", "title", "context"]

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Title cannot be empty.")
        return value

    def validate_context(self, value):
        return (value or "").strip()
