import django_filters

from .models import AuditLog


class AuditLogFilter(django_filters.FilterSet):
    action = django_filters.ChoiceFilter(choices=AuditLog.ACTION_CHOICES)

    class Meta:
        model = AuditLog
        fields = ["action"]
