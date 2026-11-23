"""Category REST API views with server-side RBAC, search, filtering, and pagination."""

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.audit.services import get_client_ip
from apps.catalog.models import Category
from apps.catalog.serializers import (
    CategorySerializer,
    CategoryUpdateSerializer,
    CategoryWriteSerializer,
)
from apps.catalog.services import (
    create_category,
    delete_category,
    set_category_active_status,
    update_category,
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
            .annotate(children_count=Count("children", distinct=True))
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
