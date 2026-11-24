"""Store profile, currency, tax, and receipt configuration model."""

from decimal import Decimal

from django.conf import settings
from django.db import models


class StoreSetting(models.Model):
    """Singleton store configuration record (pk=1) managed via apps.store_settings.services."""

    store_name = models.CharField(max_length=160, default="POS Store")
    store_name_km = models.CharField(max_length=180, blank=True, default="")
    tagline = models.CharField(max_length=200, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    address_km = models.TextField(blank=True, default="")
    tax_id = models.CharField(max_length=60, blank=True, default="")

    currency_code = models.CharField(max_length=10, default="USD")
    currency_symbol = models.CharField(max_length=8, default="$")
    exchange_rate_khr = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("4100.00"),
    )
    default_tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    receipt_header = models.TextField(blank=True, default="")
    receipt_footer = models.TextField(blank=True, default="Thank you for your purchase!")
    receipt_footer_km = models.TextField(
        blank=True, default="សូមអរគុណសម្រាប់ការទិញទំនិញ!"
    )
    show_khr_on_receipt = models.BooleanField(default=True)
    show_tax_id_on_receipt = models.BooleanField(default=False)

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="updated_store_settings",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "store_settings"
        verbose_name = "Store Setting"
        verbose_name_plural = "Store Settings"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(exchange_rate_khr__gt=Decimal("0.00")),
                name="ck_store_settings_exchange_rate_gt_zero",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(default_tax_rate__gte=Decimal("0.00"))
                    & models.Q(default_tax_rate__lte=Decimal("100.00"))
                ),
                name="ck_store_settings_default_tax_rate_range",
            ),
        ]

    def __str__(self) -> str:
        return self.store_name


class BackupSetting(models.Model):
    """Singleton database & media backup configuration with crontab-style schedule and Telegram delivery."""

    is_enabled = models.BooleanField(default=False)
    cron_expression = models.CharField(max_length=100, default="0 2 * * *")
    timezone_name = models.CharField(max_length=64, default="Asia/Phnom_Penh")

    include_database = models.BooleanField(default=True)
    include_media = models.BooleanField(default=True)
    retention_count = models.PositiveSmallIntegerField(default=7)

    telegram_enabled = models.BooleanField(default=False)
    telegram_bot_token = models.CharField(max_length=255, blank=True, default="")
    telegram_chat_id = models.CharField(max_length=100, blank=True, default="")
    telegram_message_thread_id = models.CharField(max_length=40, blank=True, default="")
    telegram_caption_prefix = models.CharField(max_length=160, blank=True, default="POS Backup")

    last_run_at = models.DateTimeField(null=True, blank=True)
    last_status = models.CharField(max_length=20, blank=True, default="")

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="updated_backup_settings",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "backup_settings"
        verbose_name = "Backup Setting"
        verbose_name_plural = "Backup Settings"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(retention_count__gte=1) & models.Q(retention_count__lte=50),
                name="ck_backup_settings_retention_range",
            ),
        ]

    def __str__(self) -> str:
        return f"BackupSetting ({self.cron_expression})"


class BackupRun(models.Model):
    """Execution ledger for manual and scheduled database/media backups."""

    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"

    class TriggerType(models.TextChoices):
        MANUAL = "manual", "Manual"
        SCHEDULED = "scheduled", "Scheduled"

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING, db_index=True)
    trigger_type = models.CharField(
        max_length=20, choices=TriggerType.choices, default=TriggerType.MANUAL, db_index=True
    )
    includes_database = models.BooleanField(default=True)
    includes_media = models.BooleanField(default=True)
    file_name = models.CharField(max_length=255, blank=True, default="")
    file_path = models.CharField(max_length=500, blank=True, default="")
    file_size_bytes = models.BigIntegerField(default=0)
    media_files_count = models.PositiveIntegerField(default=0)

    telegram_sent = models.BooleanField(default=False)
    telegram_parts_sent = models.PositiveSmallIntegerField(default=0)
    telegram_message_id = models.CharField(max_length=120, blank=True, default="")
    error_message = models.TextField(blank=True, default="")

    started_at = models.DateTimeField(auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="triggered_backup_runs",
    )

    class Meta:
        db_table = "backup_runs"
        ordering = ["-started_at", "-id"]

    def __str__(self) -> str:
        return f"BackupRun #{self.id} ({self.status})"
