from django.urls import path

from apps.store_settings.views import (
    BackupRunDownloadAPIView,
    BackupRunListAPIView,
    BackupRunNowAPIView,
    BackupSettingAPIView,
    BackupTelegramTestAPIView,
    ReceiptProfileAPIView,
    StoreSettingAPIView,
)

urlpatterns = [
    path("settings/", StoreSettingAPIView.as_view(), name="api-v1-store-settings"),
    path(
        "settings/receipt-profile/",
        ReceiptProfileAPIView.as_view(),
        name="api-v1-receipt-profile",
    ),
    path("settings/backups/", BackupSettingAPIView.as_view(), name="api-v1-backup-settings"),
    path(
        "settings/backups/test-telegram/",
        BackupTelegramTestAPIView.as_view(),
        name="api-v1-backup-test-telegram",
    ),
    path("settings/backups/run/", BackupRunNowAPIView.as_view(), name="api-v1-backup-run"),
    path("settings/backups/runs/", BackupRunListAPIView.as_view(), name="api-v1-backup-runs"),
    path(
        "settings/backups/runs/<int:pk>/download/",
        BackupRunDownloadAPIView.as_view(),
        name="api-v1-backup-run-download",
    ),
]
