from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.rbac.views import PermissionListAPIView, RolePermissionAssignAPIView, RoleViewSet

router = DefaultRouter()
router.register("roles", RoleViewSet, basename="role")

urlpatterns = [
    path("permissions/", PermissionListAPIView.as_view(), name="api-v1-permissions-list"),
    path(
        "roles/<int:pk>/permissions/",
        RolePermissionAssignAPIView.as_view(),
        name="api-v1-role-permissions",
    ),
    path("", include(router.urls)),
]
