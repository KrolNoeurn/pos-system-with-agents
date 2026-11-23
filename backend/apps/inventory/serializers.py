"""DRF serializers for Inventory balances, movements, alerts, and controlled operations."""

from decimal import Decimal, ROUND_HALF_UP

from rest_framework import serializers

from apps.catalog.models import Product
from apps.inventory.models import StockMovement

MONEY_QUANT = Decimal("0.01")
QTY_QUANT = Decimal("0.001")


class StockBalanceItemSerializer(serializers.ModelSerializer):
    """Read-only projection of a tracked Product with its authoritative StockBalance."""

    product_id = serializers.IntegerField(source="id", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_name_km = serializers.CharField(source="category.name_km", read_only=True)
    unit_abbreviation = serializers.CharField(source="unit.abbreviation", read_only=True)
    allow_decimal = serializers.BooleanField(source="unit.allow_decimal", read_only=True)
    quantity_on_hand = serializers.SerializerMethodField()
    average_unit_cost = serializers.SerializerMethodField()
    stock_value = serializers.SerializerMethodField()
    shortage = serializers.SerializerMethodField()
    stock_status = serializers.SerializerMethodField()
    last_updated = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "product_id",
            "sku",
            "barcode",
            "name",
            "name_km",
            "category",
            "category_name",
            "category_name_km",
            "unit",
            "unit_abbreviation",
            "allow_decimal",
            "purchase_cost",
            "selling_price",
            "min_stock_threshold",
            "quantity_on_hand",
            "average_unit_cost",
            "stock_value",
            "shortage",
            "stock_status",
            "is_active",
            "last_updated",
        ]
        read_only_fields = fields

    def _get_qty(self, obj) -> Decimal:
        bal = getattr(obj, "stock_balance", None)
        return bal.quantity_on_hand if bal else Decimal("0.000")

    def _get_avg_cost(self, obj) -> Decimal:
        bal = getattr(obj, "stock_balance", None)
        return bal.average_unit_cost if bal else obj.purchase_cost

    def get_quantity_on_hand(self, obj) -> str:
        return str(self._get_qty(obj).quantize(QTY_QUANT))

    def get_average_unit_cost(self, obj) -> str:
        return str(self._get_avg_cost(obj).quantize(MONEY_QUANT))

    def get_stock_value(self, obj) -> str:
        val = (self._get_qty(obj) * self._get_avg_cost(obj)).quantize(
            MONEY_QUANT, rounding=ROUND_HALF_UP
        )
        return str(val)

    def get_shortage(self, obj) -> str:
        diff = obj.min_stock_threshold - self._get_qty(obj)
        return str(max(Decimal("0.000"), diff).quantize(QTY_QUANT))

    def get_stock_status(self, obj) -> str:
        qty = self._get_qty(obj)
        if qty <= Decimal("0.000"):
            return "out_of_stock"
        if qty <= obj.min_stock_threshold:
            return "low_stock"
        return "in_stock"

    def get_last_updated(self, obj):
        bal = getattr(obj, "stock_balance", None)
        return bal.updated_at.isoformat() if bal else None


class StockMovementSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_name_km = serializers.CharField(source="product.name_km", read_only=True)
    unit_abbreviation = serializers.CharField(source="product.unit.abbreviation", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    created_by_full_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "product",
            "product_sku",
            "product_name",
            "product_name_km",
            "unit_abbreviation",
            "movement_type",
            "quantity",
            "quantity_delta",
            "balance_before",
            "balance_after",
            "unit_cost",
            "total_cost",
            "reference_type",
            "reference_code",
            "notes",
            "created_by",
            "created_by_username",
            "created_by_full_name",
            "created_at",
        ]
        read_only_fields = fields


class OpeningStockInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        allow_null=True,
    )
    reference_code = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class StockInInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        allow_null=True,
    )
    reference_code = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class StockOutInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )
    reference_code = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class StockAdjustmentInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    direction = serializers.ChoiceField(choices=["increase", "decrease"])
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        allow_null=True,
    )
    reference_code = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    notes = serializers.CharField(min_length=2)
