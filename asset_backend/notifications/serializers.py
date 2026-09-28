from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id", "type", "title", "message", "priority", "target_type", "target_id",
            "action_url", "is_read", "read_at", "created_at",
        ]
        read_only_fields = fields
