"""Read-only API view for security and financial audit logs."""

from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework.generics import ListAPIView

from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer
from apps.rbac.permissions import IsActiveAuthenticated, require_permission


class AuditLogListAPIView(ListAPIView):
    serializer_class = AuditLogSerializer
    permission_classes = [IsActiveAuthenticated, require_permission("audit.view")]

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("actor").all()

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(action__icontains=term)
                | Q(target_type__icontains=term)
                | Q(target_id__icontains=term)
                | Q(actor__username__icontains=term)
                | Q(ip_address__icontains=term)
            )

        action = self.request.query_params.get("action")
        if action:
            queryset = queryset.filter(action__icontains=action.strip())

        target_type = self.request.query_params.get("target_type")
        if target_type:
            queryset = queryset.filter(target_type=target_type.strip())

        actor_param = self.request.query_params.get("actor")
        if actor_param:
            if actor_param.isdigit():
                queryset = queryset.filter(actor_id=int(actor_param))
            else:
                queryset = queryset.filter(actor__username__icontains=actor_param.strip())

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
