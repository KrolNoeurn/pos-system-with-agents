"""Sales, POS Checkout, Catalog lookup, and Customer REST API views with server-side RBAC."""

from django.db.models import Count, Q
from django.utils.dateparse import parse_date
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.audit.services import get_client_ip
from apps.catalog.models import Product
from apps.rbac.permissions import HasRBACPermission, IsActiveAuthenticated, require_permission
from apps.sales.models import Customer, Sale
from apps.sales.serializers import (
    CustomerSerializer,
    CustomerUpdateSerializer,
    CustomerWriteSerializer,
    POSCatalogProductSerializer,
    SaleActionReasonSerializer,
    SaleCheckoutSerializer,
    SaleDetailSerializer,
    SaleListSerializer,
)
from apps.sales.services import (
    cancel_sale,
    checkout_sale,
    create_customer,
    refund_sale,
    update_customer,
)


class CustomerViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Customer directory endpoints (no hard delete to preserve historical sales)."""

    serializer_class = CustomerSerializer
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("customers.view", "sales.view", "sales.create"),
        "POST": ("customers.create",),
        "PUT": ("customers.edit",),
        "PATCH": ("customers.edit",),
    }

    def get_queryset(self):
        queryset = Customer.objects.annotate(
            sales_count=Count("sales", distinct=True)
        ).order_by("name", "id")

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(name__icontains=term)
                | Q(phone__icontains=term)
                | Q(email__icontains=term)
            )

        is_active = self.request.query_params.get("is_active")
        if is_active in ("true", "false"):
            queryset = queryset.filter(is_active=(is_active == "true"))

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = CustomerWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = create_customer(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=customer.pk)
        return Response(CustomerSerializer(refreshed).data, status=status.HTTP_201_CREATED)

    def update(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        serializer = CustomerUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_customer(
            actor=request.user,
            customer=instance,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(CustomerSerializer(refreshed).data, status=status.HTTP_200_OK)


class SaleViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    POS Checkout and immutable Sales History endpoints.

    No PUT/PATCH/DELETE endpoints are exposed so completed sales preserve full
    financial integrity; voids and refunds occur only via dedicated authorized actions.
    """

    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("sales.view",),
        "POST": ("sales.create",),
    }

    def get_serializer_class(self):
        if self.action == "list":
            return SaleListSerializer
        return SaleDetailSerializer

    def get_queryset(self):
        queryset = (
            Sale.objects.select_related(
                "customer", "cashier", "cancelled_by", "refunded_by"
            )
            .prefetch_related("items", "payments")
            .annotate(items_count=Count("items", distinct=True))
            .order_by("-created_at", "-id")
        )

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(sale_number__icontains=term)
                | Q(customer_name_snapshot__icontains=term)
                | Q(cashier__username__icontains=term)
                | Q(notes__icontains=term)
            )

        status_param = self.request.query_params.get("status")
        if status_param in Sale.Status.values:
            queryset = queryset.filter(status=status_param)

        payment_method = self.request.query_params.get("payment_method")
        if payment_method in Sale.PaymentMethod.values:
            queryset = queryset.filter(payment_method=payment_method)

        customer_id = self.request.query_params.get("customer")
        if customer_id and customer_id.isdigit():
            queryset = queryset.filter(customer_id=int(customer_id))

        date_from = self.request.query_params.get("date_from")
        if date_from:
            parsed_from = parse_date(date_from)
            if parsed_from:
                queryset = queryset.filter(created_at__date__gte=parsed_from)

        date_to = self.request.query_params.get("date_to")
        if date_to:
            parsed_to = parse_date(date_to)
            if parsed_to:
                queryset = queryset.filter(created_at__date__lte=parsed_to)

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = SaleCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        idem_header = request.headers.get("X-Idempotency-Key")
        idem_key = data.pop("idempotency_key", None) or idem_header
        order_tax_rate = data.pop("tax_rate", None)

        sale, created = checkout_sale(
            actor=request.user,
            order_tax_rate=order_tax_rate,
            idempotency_key=idem_key,
            ip_address=get_client_ip(request),
            **data,
        )
        refreshed = self.get_queryset().get(pk=sale.pk)
        payload = SaleDetailSerializer(refreshed).data
        return Response(
            payload,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="catalog",
        permission_classes=[
            IsActiveAuthenticated,
            require_permission("sales.create", "sales.view"),
        ],
    )
    def catalog(self, request: Request) -> Response:
        """
        POS cashier product lookup returning active products with read-only
        current stock availability, selling price, barcode, SKU, and unit rules.
        """
        queryset = (
            Product.objects.select_related("category", "unit", "stock_balance")
            .filter(is_active=True, category__is_active=True)
            .order_by("name", "id")
        )

        search = request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(name__icontains=term)
                | Q(name_km__icontains=term)
                | Q(sku__icontains=term)
                | Q(barcode__icontains=term)
            )

        category_id = request.query_params.get("category")
        if category_id and category_id.isdigit():
            queryset = queryset.filter(category_id=int(category_id))

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = POSCatalogProductSerializer(
                page, many=True, context={"request": request}
            )
            return self.get_paginated_response(serializer.data)

        serializer = POSCatalogProductSerializer(
            queryset, many=True, context={"request": request}
        )
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["post"],
        url_path="cancel",
        permission_classes=[IsActiveAuthenticated, require_permission("sales.cancel")],
    )
    def cancel(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        serializer = SaleActionReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cancel_sale(
            actor=request.user,
            sale=instance,
            reason=serializer.validated_data["reason"],
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(SaleDetailSerializer(refreshed).data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="refund",
        permission_classes=[IsActiveAuthenticated, require_permission("sales.refund")],
    )
    def refund(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        serializer = SaleActionReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refund_sale(
            actor=request.user,
            sale=instance,
            reason=serializer.validated_data["reason"],
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(SaleDetailSerializer(refreshed).data, status=status.HTTP_200_OK)
