"""Dashboard KPI, Financial/Purchasing Reports, and CSV Export REST API views."""

from django.http import HttpResponse
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import get_client_ip
from apps.rbac.permissions import IsActiveAuthenticated, require_permission
from apps.reports.services import (
    build_report_csv,
    get_dashboard_summary,
    get_profit_and_loss_report,
    get_purchasing_report,
    get_sales_report,
)


def _parse_date_range(request: Request):
    date_from = parse_date(request.query_params.get("date_from") or "")
    date_to = parse_date(request.query_params.get("date_to") or "")
    return date_from, date_to


class DashboardSummaryAPIView(APIView):
    permission_classes = [IsActiveAuthenticated, require_permission("dashboard.view")]

    def get(self, request: Request) -> Response:
        return Response(get_dashboard_summary(), status=status.HTTP_200_OK)


class SalesReportAPIView(APIView):
    permission_classes = [IsActiveAuthenticated, require_permission("reports.view")]

    def get(self, request: Request) -> Response:
        date_from, date_to = _parse_date_range(request)
        return Response(
            get_sales_report(date_from=date_from, date_to=date_to),
            status=status.HTTP_200_OK,
        )


class ProfitLossReportAPIView(APIView):
    permission_classes = [IsActiveAuthenticated, require_permission("reports.view")]

    def get(self, request: Request) -> Response:
        date_from, date_to = _parse_date_range(request)
        return Response(
            get_profit_and_loss_report(date_from=date_from, date_to=date_to),
            status=status.HTTP_200_OK,
        )


class PurchasingReportAPIView(APIView):
    permission_classes = [IsActiveAuthenticated, require_permission("reports.view")]

    def get(self, request: Request) -> Response:
        date_from, date_to = _parse_date_range(request)
        return Response(
            get_purchasing_report(date_from=date_from, date_to=date_to),
            status=status.HTTP_200_OK,
        )


class ReportCSVExportAPIView(APIView):
    permission_classes = [IsActiveAuthenticated, require_permission("reports.export")]

    def get(self, request: Request) -> HttpResponse:
        date_from, date_to = _parse_date_range(request)
        report_type = request.query_params.get("type", "sales")
        filename, content = build_report_csv(
            actor=request.user,
            report_type=report_type,
            date_from=date_from,
            date_to=date_to,
            ip_address=get_client_ip(request),
        )
        response = HttpResponse(content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
