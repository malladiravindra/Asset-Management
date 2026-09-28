from django.contrib import admin

from .models import Brand, Category, Model


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "icon", "color"]
    search_fields = ["name", "code"]


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ["name", "category"]
    list_filter = ["category"]
    search_fields = ["name"]
    autocomplete_fields = ["category"]


@admin.register(Model)
class ModelAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "brand"]
    list_filter = ["category", "brand"]
    search_fields = ["name"]
    autocomplete_fields = ["category", "brand"]
