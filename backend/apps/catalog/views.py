"""Catalog REST API views for Categories, Units, and Products with server-side RBAC."""

from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.audit.services import get_client_ip
from apps.catalog.models import Category, Product, Unit
from apps.catalog.serializers import (
    CategorySerializer,
    CategoryUpdateSerializer,
    CategoryWriteSerializer,
    ProductSerializer,
    ProductUpdateSerializer,
    ProductWriteSerializer,
    UnitSerializer,
    UnitUpdateSerializer,
    UnitWriteSerializer,
)
from apps.catalog.services import (
    create_category,
    create_product,
    create_unit,
    delete_category,
    delete_product,
    delete_unit,
    set_category_active_status,
    set_product_active_status,
    set_unit_active_status,
    update_category,
    update_product,
    update_unit,
)
from apps.rbac.permissions import HasRBACPermission, IsActiveAuthenticated, require_permission


class CategoryViewSet(ModelViewSet):
    """CRUD and status management for product categories."""

    serializer_class = CategorySerializer
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("products.view",),
        "POST": ("products.create",),
        "PUT": ("products.edit",),
        "PATCH": ("products.edit",),
        "DELETE": ("products.delete",),
    }

    def get_queryset(self):
        queryset = (
            Category.objects.select_related("parent")
            .annotate(
                children_count=Count("children", distinct=True),
                products_count=Count("products", distinct=True),
            )
            .order_by("name", "id")
        )

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(name__icontains=term)
                | Q(name_km__icontains=term)
                | Q(slug__icontains=term)
                | Q(description__icontains=term)
            )

        is_active = self.request.query_params.get("is_active")
        if is_active in ("true", "false"):
            queryset = queryset.filter(is_active=(is_active == "true"))

        parent = self.request.query_params.get("parent")
        if parent == "root":
            queryset = queryset.filter(parent__isnull=True)
        elif parent and parent.isdigit():
            queryset = queryset.filter(parent_id=int(parent))

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = CategoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = create_category(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=category.pk)
        return Response(CategorySerializer(refreshed).data, status=status.HTTP_201_CREATED)

    def update(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        serializer = CategoryUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        parent_provided = "parent" in data
        parent_val = data.pop("parent", None)
        update_category(
            actor=request.user,
            category=instance,
            parent_provided=parent_provided,
            parent=parent_val,
            ip_address=get_client_ip(request),
            **data,
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(CategorySerializer(refreshed).data, status=status.HTTP_200_OK)

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        delete_category(
            actor=request.user,
            category=instance,
            ip_address=get_client_ip(request),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="activate",
        permission_classes=[IsActiveAuthenticated, require_permission("products.edit")],
    )
    def activate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        set_category_active_status(
            actor=request.user,
            category=instance,
            is_active=True,
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(CategorySerializer(refreshed).data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="deactivate",
        permission_classes=[IsActiveAuthenticated, require_permission("products.edit")],
    )
    def deactivate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        set_category_active_status(
            actor=request.user,
            category=instance,
            is_active=False,
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(CategorySerializer(refreshed).data, status=status.HTTP_200_OK)


class UnitViewSet(ModelViewSet):
    """CRUD and status management for product units of measure."""

    serializer_class = UnitSerializer
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("products.view",),
        "POST": ("products.create",),
        "PUT": ("products.edit",),
        "PATCH": ("products.edit",),
        "DELETE": ("products.delete",),
    }

    def get_queryset(self):
        queryset = (
            Unit.objects.select_related("base_unit")
            .annotate(
                derived_count=Count("derived_units", distinct=True),
                products_count=Count("products", distinct=True),
            )
            .order_by("name", "id")
        )

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(name__icontains=term)
                | Q(name_km__icontains=term)
                | Q(abbreviation__icontains=term)
            )

        unit_type = self.request.query_params.get("unit_type")
        if unit_type in Unit.UnitType.values:
            queryset = queryset.filter(unit_type=unit_type)

        is_active = self.request.query_params.get("is_active")
        if is_active in ("true", "false"):
            queryset = queryset.filter(is_active=(is_active == "true"))

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = UnitWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        unit = create_unit(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=unit.pk)
        return Response(UnitSerializer(refreshed).data, status=status.HTTP_201_CREATED)

    def update(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        serializer = UnitUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        base_unit_provided = "base_unit" in data
        base_unit_val = data.pop("base_unit", None)
        update_unit(
            actor=request.user,
            unit=instance,
            base_unit_provided=base_unit_provided,
            base_unit=base_unit_val,
            ip_address=get_client_ip(request),
            **data,
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(UnitSerializer(refreshed).data, status=status.HTTP_200_OK)

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        delete_unit(
            actor=request.user,
            unit=instance,
            ip_address=get_client_ip(request),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="activate",
        permission_classes=[IsActiveAuthenticated, require_permission("products.edit")],
    )
    def activate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        set_unit_active_status(
            actor=request.user,
            unit=instance,
            is_active=True,
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(UnitSerializer(refreshed).data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="deactivate",
        permission_classes=[IsActiveAuthenticated, require_permission("products.edit")],
    )
    def deactivate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        set_unit_active_status(
            actor=request.user,
            unit=instance,
            is_active=False,
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(UnitSerializer(refreshed).data, status=status.HTTP_200_OK)


ALLOWED_PRODUCT_ORDERING = {
    "name",
    "-name",
    "sku",
    "-sku",
    "selling_price",
    "-selling_price",
    "purchase_cost",
    "-purchase_cost",
    "created_at",
    "-created_at",
    "updated_at",
    "-updated_at",
}


class ProductViewSet(ModelViewSet):
    """CRUD, search, filtering, sorting, and image upload for catalog products."""

    serializer_class = ProductSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("products.view",),
        "POST": ("products.create",),
        "PUT": ("products.edit",),
        "PATCH": ("products.edit",),
        "DELETE": ("products.delete",),
    }

    def get_queryset(self):
        queryset = Product.objects.select_related("category", "unit").all()

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(sku__icontains=term)
                | Q(barcode__icontains=term)
                | Q(name__icontains=term)
                | Q(name_km__icontains=term)
                | Q(description__icontains=term)
            )

        category_id = self.request.query_params.get("category")
        if category_id and category_id.isdigit():
            queryset = queryset.filter(category_id=int(category_id))

        unit_id = self.request.query_params.get("unit")
        if unit_id and unit_id.isdigit():
            queryset = queryset.filter(unit_id=int(unit_id))

        is_active = self.request.query_params.get("is_active")
        if is_active in ("true", "false"):
            queryset = queryset.filter(is_active=(is_active == "true"))

        min_price = self.request.query_params.get("min_price")
        if min_price:
            try:
                queryset = queryset.filter(selling_price__gte=Decimal(min_price))
            except InvalidOperation:
                pass

        max_price = self.request.query_params.get("max_price")
        if max_price:
            try:
                queryset = queryset.filter(selling_price__lte=Decimal(max_price))
            except InvalidOperation:
                pass

        ordering = self.request.query_params.get("ordering")
        if ordering in ALLOWED_PRODUCT_ORDERING:
            queryset = queryset.order_by(ordering, "id")
        else:
            queryset = queryset.order_by("name", "id")

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = ProductWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = create_product(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=product.pk)
        return Response(
            ProductSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        serializer = ProductUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        barcode_provided = "barcode" in data
        barcode_val = data.pop("barcode", None)
        image_provided = "image" in data
        image_val = data.pop("image", None)
        wholesale_provided = "wholesale_price" in data
        wholesale_val = data.pop("wholesale_price", None)

        update_product(
            actor=request.user,
            product=instance,
            barcode_provided=barcode_provided,
            barcode=barcode_val,
            image_provided=image_provided,
            image=image_val,
            wholesale_price_provided=wholesale_provided,
            wholesale_price=wholesale_val,
            ip_address=get_client_ip(request),
            **data,
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(
            ProductSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        delete_product(
            actor=request.user,
            product=instance,
            ip_address=get_client_ip(request),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="activate",
        permission_classes=[IsActiveAuthenticated, require_permission("products.edit")],
    )
    def activate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        set_product_active_status(
            actor=request.user,
            product=instance,
            is_active=True,
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(
            ProductSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="deactivate",
        permission_classes=[IsActiveAuthenticated, require_permission("products.edit")],
    )
    def deactivate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        set_product_active_status(
            actor=request.user,
            product=instance,
            is_active=False,
            ip_address=get_client_ip(request),
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(
            ProductSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )
