from django.contrib import admin

from .models import SystemSettings


@admin.register(SystemSettings)
class SystemSettingsAdmin(admin.ModelAdmin):
    """Singleton admin: edit the one row, never add a second or delete it.
    The Settings page in the app is the primary editor; this is a fallback."""

    readonly_fields = ["updated_at", "updated_by"]
    raw_id_fields = ["updated_by"]

    def has_add_permission(self, request):
        return not SystemSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
