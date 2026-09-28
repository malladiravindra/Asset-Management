import django_filters

from .models import Accessory, AccessoryAssignment, MaintenanceRecord, RepairRecord, SoftwareLicense


class MaintenanceFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=MaintenanceRecord.STATUS_CHOICES)
    priority = django_filters.ChoiceFilter(choices=MaintenanceRecord.PRIORITY_CHOICES)
    type = django_filters.ChoiceFilter(choices=MaintenanceRecord.TYPE_CHOICES)
    asset = django_filters.NumberFilter(field_name="asset_id")

    class Meta:
        model = MaintenanceRecord
        fields = ["status", "priority", "type", "asset"]


class RepairFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=RepairRecord.STATUS_CHOICES)
    priority = django_filters.ChoiceFilter(choices=RepairRecord.PRIORITY_CHOICES)
    issue_type = django_filters.ChoiceFilter(choices=RepairRecord.ISSUE_TYPE_CHOICES)
    asset = django_filters.NumberFilter(field_name="asset_id")

    class Meta:
        model = RepairRecord
        fields = ["status", "priority", "issue_type", "asset"]


class AccessoryFilter(django_filters.FilterSet):
    category = django_filters.CharFilter(field_name="category", lookup_expr="iexact")
    item_status = django_filters.ChoiceFilter(choices=Accessory.ITEM_STATUS_CHOICES)
    condition = django_filters.ChoiceFilter(choices=Accessory.CONDITION_CHOICES)
    location = django_filters.NumberFilter(field_name="location_id")

    class Meta:
        model = Accessory
        fields = ["category", "item_status", "condition", "location"]


class AccessoryAssignmentFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=AccessoryAssignment.STATUS_CHOICES)
    accessory = django_filters.NumberFilter(field_name="accessory_id")
    employee = django_filters.NumberFilter(field_name="employee_id")
    department = django_filters.NumberFilter(field_name="employee__department_id")
    location = django_filters.NumberFilter(field_name="employee__location_id")

    class Meta:
        model = AccessoryAssignment
        fields = ["status", "accessory", "employee", "department", "location"]


class SoftwareLicenseFilter(django_filters.FilterSet):
    category = django_filters.ChoiceFilter(choices=SoftwareLicense.CATEGORY_CHOICES)
    license_type = django_filters.ChoiceFilter(choices=SoftwareLicense.LICENSE_TYPE_CHOICES)

    class Meta:
        model = SoftwareLicense
        fields = ["category", "license_type"]
