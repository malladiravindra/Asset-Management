from django.contrib import admin

from .models import Asset, Department, Location, Employee

# Category/Brand/Model now live in the catalog app — see catalog/admin.py.


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ["name", "icon_label", "color_key"]
    search_fields = ["name"]


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ["name", "type", "address"]
    list_filter = ["type"]
    search_fields = ["name", "address"]


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = [
        "employee_id", "name", "designation", "email", "phone",
        "department", "location", "is_active",
    ]
    list_filter = ["department", "location", "is_active"]
    search_fields = ["employee_id", "name", "email", "designation"]
    autocomplete_fields = ["department", "location"]


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = [
        "asset_code", "name", "category", "brand", "model", "department", "location", "vendor",
        "assigned_to", "status", "condition", "cost", "current_value", "warranty_status",
    ]
    list_filter = [
        "status", "condition", "warranty_status", "category", "brand", "department", "location", "vendor",
    ]
    search_fields = ["asset_code", "name", "serial_number", "assigned_to__name"]
    # Vendor lives in the organization app — importing its admin-registered
    # ModelAdmin isn't needed here; autocomplete only needs Vendor's own
    # admin (organization/admin.py) to declare search_fields, which it does.
    autocomplete_fields = ["category", "brand", "model", "department", "location", "assigned_to", "vendor"]
