import django_filters

from .models import Assignment, PurchaseOrder, Return


class PurchaseOrderFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    department = django_filters.NumberFilter(field_name="department_id")
    vendor = django_filters.NumberFilter(field_name="vendor_id")

    class Meta:
        model = PurchaseOrder
        fields = ["status", "department", "vendor"]


class AssignmentFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    asset = django_filters.NumberFilter(field_name="asset_id")
    person = django_filters.NumberFilter(field_name="person_id")
    department = django_filters.NumberFilter(field_name="person__department_id")
    location = django_filters.NumberFilter(field_name="person__location_id")

    class Meta:
        model = Assignment
        fields = ["status", "asset", "person", "department", "location"]


class ReturnFilter(django_filters.FilterSet):
    condition = django_filters.CharFilter(field_name="condition")
    department = django_filters.NumberFilter(field_name="assignment__person__department_id")
    location = django_filters.NumberFilter(field_name="assignment__person__location_id")

    class Meta:
        model = Return
        fields = ["condition", "department", "location"]
