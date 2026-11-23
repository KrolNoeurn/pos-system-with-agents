from django.urls import path

from apps.inventory.views import (
    InventoryReportAPIView,
    LowStockAlertListAPIView,
    OpeningStockAPIView,
    StockAdjustmentAPIView,
    StockBalanceListAPIView,
    StockInAPIView,
    StockMovementListAPIView,
    StockOutAPIView,
)

urlpatterns = [
    path("inventory/balances/", StockBalanceListAPIView.as_view(), name="api-v1-inventory-balances"),
    path("inventory/low-stock/", LowStockAlertListAPIView.as_view(), name="api-v1-inventory-low-stock"),
    path("inventory/movements/", StockMovementListAPIView.as_view(), name="api-v1-inventory-movements"),
    path("inventory/opening-stock/", OpeningStockAPIView.as_view(), name="api-v1-inventory-opening-stock"),
    path("inventory/stock-in/", StockInAPIView.as_view(), name="api-v1-inventory-stock-in"),
    path("inventory/stock-out/", StockOutAPIView.as_view(), name="api-v1-inventory-stock-out"),
    path("inventory/adjustments/", StockAdjustmentAPIView.as_view(), name="api-v1-inventory-adjustments"),
    path("inventory/report/", InventoryReportAPIView.as_view(), name="api-v1-inventory-report"),
]
