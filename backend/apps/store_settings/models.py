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
