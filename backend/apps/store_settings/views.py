"""Store Settings REST API views with server-side RBAC."""

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import get_client_ip
from apps.rbac.permissions import HasRBACPermission, IsActiveAuthenticated
from apps.store_settings.serializers import (
    ReceiptProfileSerializer,
    StoreSettingSerializer,
    StoreSettingUpdateSerializer,
)
from apps.store_settings.services import get_store_settings, update_store_settings


class StoreSettingAPIView(APIView):
    """Singleton Store Settings endpoint protected by settings.view / settings.edit."""

    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("settings.view",),
        "PUT": ("settings.edit",),
        "PATCH": ("settings.edit",),
    }

    def get(self, request: Request) -> Response:
        instance = get_store_settings()
        return Response(StoreSettingSerializer(instance).data, status=status.HTTP_200_OK)

    def patch(self, request: Request) -> Response:
        serializer = StoreSettingUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = update_store_settings(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        return Response(StoreSettingSerializer(updated).data, status=status.HTTP_200_OK)

    def put(self, request: Request) -> Response:
        return self.patch(request)


class ReceiptProfileAPIView(APIView):
    """Read-only receipt header/footer/currency settings for active authenticated staff."""

    permission_classes = [IsActiveAuthenticated]

    def get(self, request: Request) -> Response:
        instance = get_store_settings()
        return Response(ReceiptProfileSerializer(instance).data, status=status.HTTP_200_OK)
