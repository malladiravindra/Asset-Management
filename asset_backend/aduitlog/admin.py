from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["timestamp", "action", "title", "actor_name", "context"]
    list_filter = ["action"]
    search_fields = ["title", "actor_name", "actor__email", "context"]
    # No autocomplete_fields for `actor` — the project's AccountUser (a
    # proxy of auth.User, see accounts/models.py) is registered, but
    # Django's admin.E039 requires the ModelAdmin be registered against
    # the EXACT model referenced by the FK (auth.User), not a proxy of it.
    raw_id_fields = ["actor"]
    readonly_fields = ["timestamp"]
    ordering = ["-timestamp"]
