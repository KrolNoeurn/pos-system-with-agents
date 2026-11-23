"""Inventory REST API views — strictly read-only balances/history + service-gated movements."""

from decimal import Decimal

from django.db.models import DecimalField, F, Q, Value
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import get_client_ip
from apps.catalog.models import Product
from apps.inventory.models import StockMovement
from apps.inventory.serializers import (
    OpeningStockInputSerializer,
    StockAdjustmentInputSerializer,
    StockBalanceItemSerializer,
    StockInInputSerializer,
    StockMovementSerializer,
    StockOutInputSerializer,
)
from apps.inventory.services import (
    get_inventory_valuation_report,
    record_opening_stock,
    record_stock_adjustment,
    record_stock_in,
    record_stock_out,
)
from apps.rbac.permissions import IsActiveAuthenticated, require_permission


def _base_tracked_products_queryset():
    return (
        Product.objects.select_related("category", "unit", "stock_balance")
        .filter(track_inventory=True)
        .annotate(
            effective_qty=Coalesce(
                F("stock_balance__quantity_on_hand"),
                Value(Decimal("0.000"), output_field=DecimalField(max_digits=14, decimal_places=3)),
            )
        )
        .order_by("name", "id")
    )


class StockBalanceListAPIView(ListAPIView):
    """Read-only paginated stock balances with search and low-stock filtering."""

    serializer_class = StockBalanceItemSerializer
    permission_classes = [IsActiveAuthenticated, require_permission("inventory.view")]

    def get_queryset(self):
        queryset = _base_tracked_products_queryset()

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(sku__icontains=term)
                | Q(barcode__icontains=term)
                | Q(name__icontains=term)
                | Q(name_km__icontains=term)
            )

        category_id = self.request.query_params.get("category")
        if category_id and category_id.isdigit():
            queryset = queryset.filter(category_id=int(category_id))

        is_active = self.request.query_params.get("is_active")
        if is_active in ("true", "false"):
            queryset = queryset.filter(is_active=(is_active == "true"))

        stock_state = self.request.query_params.get("stock_status")
        if stock_state == "out_of_stock":
            queryset = queryset.filter(effective_qty__lte=Decimal("0.000"))
        elif stock_state == "low_stock":
            queryset = queryset.filter(
                effective_qty__gt=Decimal("0.000"),
                effective_qty__lte=F("min_stock_threshold"),
            )
        elif stock_state == "in_stock":
            queryset = queryset.filter(effective_qty__gt=Decimal("0.000")).filter(
                effective_qty__gt=F("min_stock_threshold")
            )

        if self.request.query_params.get("low_stock") == "true":
            queryset = queryset.filter(effective_qty__lte=F("min_stock_threshold"))

        return queryset


class LowStockAlertListAPIView(ListAPIView):
    """Read-only paginated low-stock and out-of-stock alerts for active tracked products."""

    serializer_class = StockBalanceItemSerializer
    permission_classes = [IsActiveAuthenticated, require_permission("inventory.view")]

    def get_queryset(self):
        queryset = _base_tracked_products_queryset().filter(
            is_active=True,
            effective_qty__lte=F("min_stock_threshold"),
        )
        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(sku__icontains=term)
                | Q(name__icontains=term)
                | Q(name_km__icontains=term)
            )
        return queryset.order_by("effective_qty", "name", "id")


class StockMovementListAPIView(ListAPIView):
    """Read-only paginated inventory movement history."""

    serializer_class = StockMovementSerializer
    permission_classes = [IsActiveAuthenticated, require_permission("inventory.view")]

    def get_queryset(self):
        queryset = StockMovement.objects.select_related(
            "product", "product__unit", "created_by"
        ).order_by("-created_at", "-id")

        product_id = self.request.query_params.get("product")
        if product_id and product_id.isdigit():
            queryset = queryset.filter(product_id=int(product_id))

        movement_type = self.request.query_params.get("movement_type")
        if movement_type in StockMovement.MovementType.values:
            queryset = queryset.filter(movement_type=movement_type)

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(product__sku__icontains=term)
                | Q(product__name__icontains=term)
                | Q(product__name_km__icontains=term)
                | Q(reference_code__icontains=term)
                | Q(notes__icontains=term)
            )

        date_from = self.request.query_params.get("date_from")
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        date_to = self.request.query_params.get("date_to")
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        return queryset


class OpeningStockAPIView(APIView):
    permission_classes = [IsActiveAuthenticated, require_permission("inventory.adjust")]

    def post(self, request: Request) -> Response:
        serializer = OpeningStockInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movement = record_opening_stock(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = StockMovement.objects.select_related(
            "product", "product__unit", "created_by"
        ).get(pk=movement.pk)
        return Response(StockMovementSerializer(refreshed).data, status=status.HTTP_201_CREATED)


class StockInAPIView(APIView):
    permission_classes = [IsActiveAuthenticated, require_permission("inventory.adjust")]

    def post(self, request: Request) -> Response:
        serializer = StockInInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movement = record_stock_in(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = StockMovement.objects.select_related(
            "product", "product__unit", "created_by"
        ).get(pk=movement.pk)
        return Response(StockMovementSerializer(refreshed).data, status=status.HTTP_201_CREATED)


class StockOutAPIView(APIView):
    permission_classes = [IsActiveAuthenticated, require_permission("inventory.adjust")]

    def post(self, request: Request) -> Response:
        serializer = StockOutInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movement = record_stock_out(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = StockMovement.objects.select_related(
            "product", "product__unit", "created_by"
        ).get(pk=movement.pk)
        return Response(StockMovementSerializer(refreshed).data, status=status.HTTP_201_CREATED)


class StockAdjustmentAPIView(APIView):
    permission_classes = [IsActiveAuthenticated, require_permission("inventory.adjust")]

    def post(self, request: Request) -> Response:
        serializer = StockAdjustmentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movement = record_stock_adjustment(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = StockMovement.objects.select_related(
            "product", "product__unit", "created_by"
        ).get(pk=movement.pk)
        return Response(StockMovementSerializer(refreshed).data, status=status.HTTP_201_CREATED)


class InventoryReportAPIView(APIView):
    """Inventory valuation, stock health, and movement summary report."""

    permission_classes = [IsActiveAuthenticated, require_permission("inventory.view", "reports.view")]

    def get(self, request: Request) -> Response:
        category_param = request.query_params.get("category")
        category_id = int(category_param) if category_param and category_param.isdigit() else None
        report = get_inventory_valuation_report(category_id=category_id)
        return Response(report, status=status.HTTP_200_OK)
