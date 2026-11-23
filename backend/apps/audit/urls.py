from django.urls import path

from apps.audit.views import AuditLogListAPIView

urlpatterns = [
    path("audit-logs/", AuditLogListAPIView.as_view(), name="api-v1-audit-logs"),
]
