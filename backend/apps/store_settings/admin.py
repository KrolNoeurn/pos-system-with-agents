from django.contrib import admin

from apps.store_settings.models import StoreSetting


@admin.register(StoreSetting)
class StoreSettingAdmin(admin.ModelAdmin):
    list_display = (
        "store_name",
        "currency_code",
        "exchange_rate_khr",
        "default_tax_rate",
        "updated_by",
        "updated_at",
    )
