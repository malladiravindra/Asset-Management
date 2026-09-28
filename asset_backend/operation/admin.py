from django.contrib import admin

from .models import Accessory, MaintenanceRecord, RepairRecord, SoftwareLicense


@admin.register(MaintenanceRecord)
class MaintenanceRecordAdmin(admin.ModelAdmin):
    list_display = ["id", "asset", "type", "status", "priority", "scheduled_date", "technician"]
    list_filter = ["status", "priority", "type"]
    search_fields = ["asset__asset_code", "asset__name", "technician"]


@admin.register(RepairRecord)
class RepairRecordAdmin(admin.ModelAdmin):
    list_display = ["repair_id", "asset", "issue_type", "status", "priority", "reported_date"]
    list_filter = ["status", "priority", "issue_type"]
    search_fields = ["repair_id", "asset__asset_code", "asset__name", "issue"]


@admin.register(Accessory)
class AccessoryAdmin(admin.ModelAdmin):
    list_display = ["sku", "name", "category", "total_qty", "assigned_qty", "item_status"]
    list_filter = ["item_status", "condition", "category"]
    search_fields = ["sku", "name", "vendor", "brand"]


@admin.register(SoftwareLicense)
class SoftwareLicenseAdmin(admin.ModelAdmin):
    list_display = ["license_id", "name", "vendor", "category", "license_type", "total_seats", "seats_used"]
    list_filter = ["category", "license_type"]
    search_fields = ["license_id", "name", "vendor"]
