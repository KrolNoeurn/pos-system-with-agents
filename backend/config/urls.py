"""Root URL configuration for the POS backend."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.rbac.urls")),
    path("api/v1/", include("apps.audit.urls")),
    path("api/v1/", include("apps.catalog.urls")),
]
