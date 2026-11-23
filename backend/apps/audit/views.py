"""Read-only API view for security audit logs."""

from rest_framework.generics import ListAPIView

from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer
from apps.rbac.permissions import IsActiveAuthenticated, require_permission


class AuditLogListAPIView(ListAPIView):
    serializer_class = AuditLogSerializer
    permission_classes = [IsActiveAuthenticated, require_permission("audit.view")]

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("actor").all()
        action = self.request.query_params.get("action")
        target_type = self.request.query_params.get("target_type")
        if action:
            queryset = queryset.filter(action=action)
        if target_type:
            queryset = queryset.filter(target_type=target_type)
        return queryset
