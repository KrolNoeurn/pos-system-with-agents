from django.contrib import admin

from apps.catalog.models import Category, Product, Unit


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "name_km", "slug", "parent", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "name_km", "slug")
    ordering = ("name",)


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "name_km",
        "abbreviation",
        "unit_type",
        "base_unit",
        "conversion_factor",
        "allow_decimal",
        "is_active",
    )
    list_filter = ("unit_type", "is_active", "allow_decimal")
    search_fields = ("name", "name_km", "abbreviation")
    ordering = ("name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "sku",
        "barcode",
        "name",
        "category",
        "unit",
        "purchase_cost",
        "selling_price",
        "wholesale_price",
        "min_stock_threshold",
        "is_active",
    )
    list_filter = ("is_active", "category", "unit", "track_inventory")
    search_fields = ("sku", "barcode", "name", "name_km")
    ordering = ("name",)
