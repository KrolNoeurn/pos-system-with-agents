"""API v1 core routing."""

from django.urls import path

from apps.core.views import HealthCheckAPIView

urlpatterns = [
    path("health/", HealthCheckAPIView.as_view(), name="api-v1-health"),
]
