"""DRF serializers for Store Settings and non-sensitive Receipt Profile."""

from decimal import Decimal

from rest_framework import serializers

from apps.store_settings.models import StoreSetting


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
