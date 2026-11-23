"""API views for RBAC permissions and roles."""

from django.db.models import Count
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.audit.services import get_client_ip
from apps.rbac.models import Permission, Role
from apps.rbac.permissions import HasRBACPermission, IsActiveAuthenticated, require_permission
from apps.rbac.serializers import (
    PermissionSerializer,
    RolePermissionAssignSerializer,
    RoleSerializer,
)
from apps.rbac.services import (
    assign_role_permissions,
    create_role,
    delete_role,
    update_role,
)


class PermissionListAPIView(ListAPIView):
    """List canonical RBAC permissions ordered by module and action."""

    serializer_class = PermissionSerializer
    permission_classes = [IsActiveAuthenticated, require_permission("roles.view", "roles.manage")]
    pagination_class = None

    def get_queryset(self):
        queryset = Permission.objects.all()
        module = self.request.query_params.get("module")
        if module:
            queryset = queryset.filter(module=module)
        return queryset


class RoleViewSet(ModelViewSet):
    """Role CRUD and permission assignment endpoints with strict RBAC."""

    serializer_class = RoleSerializer
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("roles.view", "users.view", "users.create", "users.edit"),
        "POST": ("roles.manage",),
        "PUT": ("roles.manage",),
        "PATCH": ("roles.manage",),
        "DELETE": ("roles.manage",),
    }

    def get_queryset(self):
        queryset = (
            Role.objects.prefetch_related("permissions")
            .annotate(user_count=Count("users", distinct=True))
            .order_by("name", "id")
        )
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search.strip())
        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = create_role(
            actor=request.user,
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
            slug=serializer.validated_data.get("slug"),
            permission_ids=serializer.validated_data.get("permission_ids", []),
            ip_address=get_client_ip(request),
        )
        role_with_counts = self.get_queryset().get(pk=role.pk)
        return Response(self.get_serializer(role_with_counts).data, status=status.HTTP_201_CREATED)

    def update(self, request: Request, *args, **kwargs) -> Response:
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        role = update_role(
            actor=request.user,
            role=instance,
            name=serializer.validated_data.get("name"),
            description=serializer.validated_data.get("description"),
            permission_ids=serializer.validated_data.get("permission_ids"),
            ip_address=get_client_ip(request),
        )
        role_with_counts = self.get_queryset().get(pk=role.pk)
        return Response(self.get_serializer(role_with_counts).data, status=status.HTTP_200_OK)

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        delete_role(actor=request.user, role=instance, ip_address=get_client_ip(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class RolePermissionAssignAPIView(APIView):
    """Explicit endpoint for assigning permissions to a role: PUT /api/v1/roles/{id}/permissions/."""

    permission_classes = [IsActiveAuthenticated, require_permission("roles.manage")]

    def put(self, request: Request, pk: int) -> Response:
        role = Role.objects.prefetch_related("permissions").filter(pk=pk).first()
        if role is None:
            return Response({"detail": "Role not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RolePermissionAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assign_role_permissions(
            actor=request.user,
            role=role,
            permission_ids=serializer.validated_data["permission_ids"],
            ip_address=get_client_ip(request),
        )
        refreshed = (
            Role.objects.prefetch_related("permissions")
            .annotate(user_count=Count("users", distinct=True))
            .get(pk=role.pk)
        )
        return Response(RoleSerializer(refreshed).data, status=status.HTTP_200_OK)
