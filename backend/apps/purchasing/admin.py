from django.contrib import admin

from apps.purchasing.models import Purchase, PurchaseItem, Supplier


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "contact_name", "phone", "email", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "contact_name", "phone", "email")


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 0
    readonly_fields = (
        "product",
        "product_sku_snapshot",
        "product_name_snapshot",
        "unit_abbreviation_snapshot",
        "quantity",
        "unit_cost",
        "line_total",
    )


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = (
        "purchase_number",
        "supplier",
        "status",
        "purchase_date",
        "subtotal",
        "discount_amount",
        "total_amount",
        "received_at",
    )
    list_filter = ("status", "purchase_date")
    search_fields = ("purchase_number", "supplier__name")
    inlines = [PurchaseItemInline]
