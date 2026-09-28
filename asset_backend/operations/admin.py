from django.contrib import admin

from .models import Assignment, PurchaseOrder, PurchaseOrderItem, Return


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ["po_number", "vendor", "department", "requested_by", "status", "order_date"]
    list_filter = ["status"]
    search_fields = ["po_number", "vendor__name", "requested_by__name"]
    inlines = [PurchaseOrderItemInline]


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ["asset", "person", "status", "assigned_date"]
    list_filter = ["status"]
    search_fields = ["asset__asset_code", "asset__name", "person__name"]


@admin.register(Return)
class ReturnAdmin(admin.ModelAdmin):
    list_display = ["assignment", "return_date", "condition"]
    list_filter = ["condition"]
