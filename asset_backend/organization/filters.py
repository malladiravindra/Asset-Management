import django_filters

from assets.models import Location

from .models import Vendor


class EmployeeFilter(django_filters.FilterSet):
    department = django_filters.NumberFilter(field_name="department_id")
    # Employee has a `location` FK too (see assets.models.Employee) — without
    # this, ?location= is silently ignored by django-filter (an undeclared
    # query param on a FilterSet is a no-op, not a 400), so the Organization
    # page would look filterable but return the same unfiltered result set.
    location = django_filters.NumberFilter(field_name="location_id")


class LocationFilter(django_filters.FilterSet):
    # Plain CharFilter + method, not ChoiceFilter — the Locations page's
    # "All" tab needs `?type=all` (and no `type` at all) to mean "every
    # location", which a ChoiceFilter can't express since "all" isn't one
    # of Location.TYPE_CHOICES.
    type = django_filters.CharFilter(method="filter_type")

    def filter_type(self, queryset, name, value):
        value = (value or "").strip().lower()
        if not value or value == "all":
            return queryset
        return queryset.filter(type=value)


class VendorFilter(django_filters.FilterSet):
    type = django_filters.CharFilter(method="filter_type")

    def filter_type(self, queryset, name, value):
        value = (value or "").strip().lower().replace(" ", "_")
        if not value or value == "all":
            return queryset
        return queryset.filter(vendor_type=value)
