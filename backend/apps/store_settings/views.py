"""Store Settings and Backup Control REST API views with server-side RBAC."""

from pathlib import Path

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import get_client_ip, log_audit_event
from apps.rbac.permissions import HasRBACPermission, IsActiveAuthenticated
from apps.store_settings.backup_services import (
    execute_backup,
    get_backup_root,
    get_backup_settings,
    test_telegram_connection,
    update_backup_settings,
)
from apps.store_settings.models import BackupRun
from apps.store_settings.serializers import (
    BackupRunSerializer,
    BackupRunTriggerSerializer,
    BackupSettingSerializer,
    BackupSettingUpdateSerializer,
    ReceiptProfileSerializer,
    StoreSettingSerializer,
    StoreSettingUpdateSerializer,
    TelegramTestSerializer,
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


class BackupSettingAPIView(APIView):
    """Singleton Backup & Telegram Crontab configuration protected by settings.view / settings.edit."""

    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("settings.view",),
        "PUT": ("settings.edit",),
        "PATCH": ("settings.edit",),
    }

    def get(self, request: Request) -> Response:
        instance = get_backup_settings()
        return Response(BackupSettingSerializer(instance).data, status=status.HTTP_200_OK)

    def patch(self, request: Request) -> Response:
        serializer = BackupSettingUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = update_backup_settings(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        return Response(BackupSettingSerializer(updated).data, status=status.HTTP_200_OK)

    def put(self, request: Request) -> Response:
        return self.patch(request)


class BackupTelegramTestAPIView(APIView):
    """Test Telegram Bot token & Chat ID connectivity live."""

    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {"POST": ("settings.edit",)}

    def post(self, request: Request) -> Response:
        serializer = TelegramTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = test_telegram_connection(
            actor=request.user,
            bot_token=serializer.validated_data.get("telegram_bot_token"),
            chat_id=serializer.validated_data.get("telegram_chat_id"),
            message_thread_id=serializer.validated_data.get("telegram_message_thread_id"),
            ip_address=get_client_ip(request),
        )
        return Response(result, status=status.HTTP_200_OK)


class BackupRunNowAPIView(APIView):
    """Trigger an immediate database & media backup (and optional Telegram upload)."""

    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {"POST": ("settings.edit",)}

    def post(self, request: Request) -> Response:
        serializer = BackupRunTriggerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        run = execute_backup(
            actor=request.user,
            trigger_type=BackupRun.TriggerType.MANUAL,
            include_database=serializer.validated_data.get("include_database"),
            include_media=serializer.validated_data.get("include_media"),
            send_to_telegram=serializer.validated_data.get("send_to_telegram"),
            ip_address=get_client_ip(request),
        )
        http_status = (
            status.HTTP_201_CREATED
            if run.status == BackupRun.Status.SUCCESS
            else status.HTTP_502_BAD_GATEWAY
        )
        return Response(BackupRunSerializer(run).data, status=http_status)


class BackupRunListAPIView(ListAPIView):
    """Paginated backup execution history."""

    serializer_class = BackupRunSerializer
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {"GET": ("settings.view",)}

    def get_queryset(self):
        qs = BackupRun.objects.select_related("triggered_by").all()
        status_filter = self.request.query_params.get("status")
        if status_filter in ("running", "success", "failed"):
            qs = qs.filter(status=status_filter)
        return qs


class BackupRunDownloadAPIView(APIView):
    """Download a retained local backup .zip archive."""

    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {"GET": ("settings.view",)}

    def get(self, request: Request, pk: int):
        run = get_object_or_404(BackupRun, pk=pk)
        if not run.file_path:
            raise NotFound("Backup file has been pruned or is no longer stored locally.")

        archive_path = Path(run.file_path).resolve()
        backup_root = get_backup_root().resolve()
        if backup_root not in archive_path.parents or not archive_path.is_file():
            raise NotFound("Backup file is unavailable.")

        log_audit_event(
            actor=request.user,
            action="backup.downloaded",
            target_type="BackupRun",
            target_id=run.id,
            ip_address=get_client_ip(request),
            metadata={"file_name": run.file_name},
        )
        return FileResponse(
            archive_path.open("rb"),
            as_attachment=True,
            filename=run.file_name or archive_path.name,
            content_type="application/zip",
        )
