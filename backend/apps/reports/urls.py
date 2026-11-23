from django.urls import path

from apps.reports.views import (
    DashboardSummaryAPIView,
    ProfitLossReportAPIView,
    PurchasingReportAPIView,
    ReportCSVExportAPIView,
    SalesReportAPIView,
)

urlpatterns = [
    path("reports/dashboard/", DashboardSummaryAPIView.as_view(), name="api-v1-reports-dashboard"),
    path("reports/sales/", SalesReportAPIView.as_view(), name="api-v1-reports-sales"),
    path("reports/profit-loss/", ProfitLossReportAPIView.as_view(), name="api-v1-reports-pnl"),
    path("reports/purchasing/", PurchasingReportAPIView.as_view(), name="api-v1-reports-purchasing"),
    path("reports/export/", ReportCSVExportAPIView.as_view(), name="api-v1-reports-export"),
]
