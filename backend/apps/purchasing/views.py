"""Purchasing & Supplier REST API views with server-side RBAC."""

from django.db.models import Count, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.audit.services import get_client_ip
from apps.purchasing.models import Purchase, Supplier
from apps.purchasing.serializers import (
    PurchaseCancelSerializer,
    PurchaseCreateSerializer,
    PurchaseDetailSerializer,
    PurchaseListSerializer,
    PurchaseReceiveSerializer,
    PurchaseUpdateSerializer,
    SupplierSerializer,
    SupplierUpdateSerializer,
    SupplierWriteSerializer,
)
from apps.purchasing.services import (
    cancel_purchase,
    create_purchase,
    create_supplier,
    import_suppliers_csv,
    receive_purchase,
    update_purchase,
    update_supplier,
)
from apps.rbac.permissions import HasRBACPermission, IsActiveAuthenticated, require_permission


class SupplierViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Supplier directory endpoints (no hard delete to preserve historical purchases)."""

    serializer_class = SupplierSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("suppliers.view", "purchases.view", "purchases.create"),
        "POST": ("suppliers.create",),
        "PUT": ("suppliers.edit",),
        "PATCH": ("suppliers.edit",),
    }

    def get_queryset(self):
        queryset = Supplier.objects.annotate(
            purchases_count=Count("purchases", distinct=True)
        ).order_by("name", "id")

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(name__icontains=term)
                | Q(contact_name__icontains=term)
                | Q(phone__icontains=term)
                | Q(email__icontains=term)
            )

        is_active = self.request.query_params.get("is_active")
        if is_active in ("true", "false"):
            queryset = queryset.filter(is_active=(is_active == "true"))

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = SupplierWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        supplier = create_supplier(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=supplier.pk)
        return Response(
            SupplierSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        serializer = SupplierUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_supplier(
            actor=request.user,
            supplier=instance,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(
            SupplierSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="activate",
        permission_classes=[IsActiveAuthenticated, require_permission("suppliers.edit")],
    )
    def activate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        update_supplier(
            actor=request.user,
            supplier=instance,
            is_active=True,
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(
            SupplierSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="deactivate",
        permission_classes=[IsActiveAuthenticated, require_permission("suppliers.edit")],
    )
    def deactivate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        update_supplier(
            actor=request.user,
            supplier=instance,
            is_active=False,
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(
            SupplierSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="import-csv",
        permission_classes=[IsActiveAuthenticated, require_permission("suppliers.create")],
    )
    def import_csv(self, request: Request) -> Response:
        uploaded = request.FILES.get("file")
        if uploaded is not None:
            csv_text = uploaded.read().decode("utf-8-sig", errors="replace")
        else:
            csv_text = str(request.data.get("csv_text") or "")

        summary = import_suppliers_csv(
            actor=request.user,
            csv_text=csv_text,
            ip_address=get_client_ip(request),
        )
        return Response(summary, status=status.HTTP_200_OK)


class PurchaseViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Purchase Order lifecycle endpoints.

    No DELETE endpoint is exposed so purchase history is preserved permanently.
    """

    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("purchases.view",),
        "POST": ("purchases.create",),
        "PUT": ("purchases.create",),
        "PATCH": ("purchases.create",),
    }

    def get_serializer_class(self):
        if self.action == "list":
            return PurchaseListSerializer
        return PurchaseDetailSerializer

    def get_queryset(self):
        queryset = (
            Purchase.objects.select_related(
                "supplier", "created_by", "received_by", "cancelled_by"
            )
            .prefetch_related("items")
            .annotate(items_count=Count("items", distinct=True))
            .order_by("-created_at", "-id")
        )

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(purchase_number__icontains=term)
                | Q(supplier__name__icontains=term)
                | Q(notes__icontains=term)
            )

        status_param = self.request.query_params.get("status")
        if status_param in Purchase.Status.values:
            queryset = queryset.filter(status=status_param)

        supplier_id = self.request.query_params.get("supplier")
        if supplier_id and supplier_id.isdigit():
            queryset = queryset.filter(supplier_id=int(supplier_id))

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = PurchaseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        initial_status = data.pop("status", Purchase.Status.DRAFT)
        purchase = create_purchase(
            actor=request.user,
            initial_status=initial_status,
            ip_address=get_client_ip(request),
            **data,
        )
        refreshed = self.get_queryset().get(pk=purchase.pk)
        return Response(
            PurchaseDetailSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        serializer = PurchaseUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_provided = "expected_date" in data
        expected_val = data.pop("expected_date", None)
        new_status = data.pop("status", None)
        update_purchase(
            actor=request.user,
            purchase=instance,
            expected_date_provided=expected_provided,
            expected_date=expected_val,
            new_status=new_status,
            ip_address=get_client_ip(request),
            **data,
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(
            PurchaseDetailSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="receive",
        permission_classes=[IsActiveAuthenticated, require_permission("purchases.receive")],
    )
    def receive(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        serializer = PurchaseReceiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        receive_purchase(
            actor=request.user,
            purchase=instance,
            notes=serializer.validated_data.get("notes", ""),
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(
            PurchaseDetailSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="cancel",
        permission_classes=[IsActiveAuthenticated, require_permission("purchases.cancel")],
    )
    def cancel(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        serializer = PurchaseCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cancel_purchase(
            actor=request.user,
            purchase=instance,
            reason=serializer.validated_data.get("reason", ""),
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(
            PurchaseDetailSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )
