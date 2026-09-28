from django.contrib import admin

from .models import Vendor

# Employee/Department/Location are registered in assets/admin.py — they're
# still owned by the assets app, just reused here.


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ["vendor_code", "name", "email", "phone", "vendor_type", "status", "created_at"]
    list_filter = ["vendor_type", "status"]
    search_fields = ["name", "email", "vendor_code"]
    # Server-generated (Vendor.save / organization.codes.next_vendor_code).
    readonly_fields = ["vendor_code"]
