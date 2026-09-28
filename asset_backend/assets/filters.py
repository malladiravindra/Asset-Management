import django_filters

from .models import Asset


class AssetFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=Asset.STATUS_CHOICES)
    department = django_filters.NumberFilter(field_name="department_id")
    location = django_filters.NumberFilter(field_name="location_id")
    category = django_filters.NumberFilter(field_name="category_id")

    class Meta:
        model = Asset
        fields = ["status", "department", "location", "category"]
