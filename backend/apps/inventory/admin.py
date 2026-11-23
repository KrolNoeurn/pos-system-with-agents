from django.contrib import admin

from apps.inventory.models import StockBalance, StockMovement


@admin.register(StockBalance)
class StockBalanceAdmin(admin.ModelAdmin):
    list_display = ("product", "quantity_on_hand", "average_unit_cost", "updated_at")
    search_fields = ("product__sku", "product__name")
    readonly_fields = ("product", "quantity_on_hand", "average_unit_cost", "updated_at")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "product",
        "movement_type",
        "quantity_delta",
        "balance_before",
        "balance_after",
        "unit_cost",
        "reference_code",
        "created_by",
    )
    list_filter = ("movement_type", "reference_type")
    search_fields = ("product__sku", "product__name", "reference_code", "notes")
    readonly_fields = [f.name for f in StockMovement._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
