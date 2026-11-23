from django.contrib import admin

from apps.sales.models import Customer, Sale, SaleItem, SalePayment


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    readonly_fields = (
        "product",
        "product_sku_snapshot",
        "product_name_snapshot",
        "unit_abbreviation_snapshot",
        "quantity",
        "unit_price",
        "unit_cost_snapshot",
        "tax_rate_snapshot",
        "line_subtotal",
        "line_tax",
        "line_total",
    )


class SalePaymentInline(admin.TabularInline):
    model = SalePayment
    extra = 0
    readonly_fields = ("payment_method", "amount", "reference_code", "created_at")


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "email", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "phone", "email")


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = (
        "sale_number",
        "customer_name_snapshot",
        "status",
        "total_amount",
        "payment_method",
        "cashier",
        "created_at",
    )
    list_filter = ("status", "payment_method", "created_at")
    search_fields = ("sale_number", "customer_name_snapshot", "cashier__username")
    inlines = [SaleItemInline, SalePaymentInline]
