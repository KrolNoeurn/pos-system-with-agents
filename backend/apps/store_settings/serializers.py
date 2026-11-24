"""DRF serializers for Store Settings and non-sensitive Receipt Profile."""

from decimal import Decimal

from rest_framework import serializers

from apps.store_settings.backup_services import (
    build_crontab_lines,
    get_backup_root,
    get_next_cron_runs,
    mask_bot_token,
)
from apps.store_settings.models import BackupRun, BackupSetting, StoreSetting


class StoreSettingSerializer(serializers.ModelSerializer):
    updated_by_username = serializers.CharField(
        source="updated_by.username", read_only=True, default=None
    )

    class Meta:
        model = StoreSetting
        fields = [
            "id",
            "store_name",
            "store_name_km",
            "tagline",
            "phone",
            "email",
            "address",
            "address_km",
            "tax_id",
            "currency_code",
            "currency_symbol",
            "exchange_rate_khr",
            "default_tax_rate",
            "receipt_header",
            "receipt_footer",
            "receipt_footer_km",
            "show_khr_on_receipt",
            "show_tax_id_on_receipt",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReceiptProfileSerializer(serializers.ModelSerializer):
    """Subset of store settings safe for authenticated cashiers to print receipts."""

    class Meta:
        model = StoreSetting
        fields = [
            "store_name",
            "store_name_km",
            "tagline",
            "phone",
            "address",
            "address_km",
            "tax_id",
            "currency_code",
            "currency_symbol",
            "exchange_rate_khr",
            "receipt_header",
            "receipt_footer",
            "receipt_footer_km",
            "show_khr_on_receipt",
            "show_tax_id_on_receipt",
        ]
        read_only_fields = fields


class StoreSettingUpdateSerializer(serializers.Serializer):
    store_name = serializers.CharField(max_length=160, required=False)
    store_name_km = serializers.CharField(max_length=180, required=False, allow_blank=True)
    tagline = serializers.CharField(max_length=200, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    address_km = serializers.CharField(required=False, allow_blank=True)
    tax_id = serializers.CharField(max_length=60, required=False, allow_blank=True)
    currency_code = serializers.CharField(max_length=10, required=False)
    currency_symbol = serializers.CharField(max_length=8, required=False)
    exchange_rate_khr = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
    )
    default_tax_rate = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.00"),
        max_value=Decimal("100.00"),
        required=False,
    )
    receipt_header = serializers.CharField(required=False, allow_blank=True)
    receipt_footer = serializers.CharField(required=False, allow_blank=True)
    receipt_footer_km = serializers.CharField(required=False, allow_blank=True)
    show_khr_on_receipt = serializers.BooleanField(required=False)
    show_tax_id_on_receipt = serializers.BooleanField(required=False)

    def validate_store_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Store name cannot be blank.")
        return clean


class BackupSettingSerializer(serializers.ModelSerializer):
    updated_by_username = serializers.CharField(
        source="updated_by.username", read_only=True, default=None
    )
    has_telegram_token = serializers.SerializerMethodField()
    telegram_bot_token_masked = serializers.SerializerMethodField()
    next_runs = serializers.SerializerMethodField()
    crontab_entry = serializers.SerializerMethodField()
    polling_crontab_entry = serializers.SerializerMethodField()
    backup_dir = serializers.SerializerMethodField()

    class Meta:
        model = BackupSetting
        fields = [
            "id",
            "is_enabled",
            "cron_expression",
            "timezone_name",
            "include_database",
            "include_media",
            "retention_count",
            "telegram_enabled",
            "has_telegram_token",
            "telegram_bot_token_masked",
            "telegram_chat_id",
            "telegram_message_thread_id",
            "telegram_caption_prefix",
            "last_run_at",
            "last_status",
            "next_runs",
            "crontab_entry",
            "polling_crontab_entry",
            "backup_dir",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_has_telegram_token(self, obj) -> bool:
        return bool((obj.telegram_bot_token or "").strip())

    def get_telegram_bot_token_masked(self, obj) -> str:
        return mask_bot_token(obj.telegram_bot_token)

    def get_next_runs(self, obj) -> list[str]:
        return get_next_cron_runs(obj.cron_expression, obj.timezone_name, count=3)

    def get_crontab_entry(self, obj) -> str:
        return build_crontab_lines(obj)["direct"]

    def get_polling_crontab_entry(self, obj) -> str:
        return build_crontab_lines(obj)["polling"]

    def get_backup_dir(self, obj) -> str:
        return str(get_backup_root())


class BackupSettingUpdateSerializer(serializers.Serializer):
    is_enabled = serializers.BooleanField(required=False)
    cron_expression = serializers.CharField(max_length=100, required=False)
    timezone_name = serializers.CharField(max_length=64, required=False)
    include_database = serializers.BooleanField(required=False)
    include_media = serializers.BooleanField(required=False)
    retention_count = serializers.IntegerField(min_value=1, max_value=50, required=False)
    telegram_enabled = serializers.BooleanField(required=False)
    telegram_bot_token = serializers.CharField(
        max_length=255, required=False, allow_blank=True, write_only=True
    )
    clear_telegram_token = serializers.BooleanField(required=False, default=False)
    telegram_chat_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    telegram_message_thread_id = serializers.CharField(max_length=40, required=False, allow_blank=True)
    telegram_caption_prefix = serializers.CharField(max_length=160, required=False, allow_blank=True)


class TelegramTestSerializer(serializers.Serializer):
    telegram_bot_token = serializers.CharField(
        max_length=255, required=False, allow_blank=True, write_only=True
    )
    telegram_chat_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    telegram_message_thread_id = serializers.CharField(max_length=40, required=False, allow_blank=True)


class BackupRunTriggerSerializer(serializers.Serializer):
    include_database = serializers.BooleanField(required=False)
    include_media = serializers.BooleanField(required=False)
    send_to_telegram = serializers.BooleanField(required=False)


class BackupRunSerializer(serializers.ModelSerializer):
    triggered_by_username = serializers.CharField(
        source="triggered_by.username", read_only=True, default=None
    )
    can_download = serializers.SerializerMethodField()

    class Meta:
        model = BackupRun
        fields = [
            "id",
            "status",
            "trigger_type",
            "includes_database",
            "includes_media",
            "file_name",
            "file_size_bytes",
            "media_files_count",
            "telegram_sent",
            "telegram_parts_sent",
            "telegram_message_id",
            "error_message",
            "can_download",
            "started_at",
            "completed_at",
            "triggered_by",
            "triggered_by_username",
        ]
        read_only_fields = fields

    def get_can_download(self, obj) -> bool:
        if not obj.file_path:
            return False
        from pathlib import Path
        return Path(obj.file_path).is_file()
