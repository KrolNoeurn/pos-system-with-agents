"""DRF serializers for Customers, POS Catalog, Checkout, and Sales History."""

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Product
from apps.sales.models import Customer, Sale, SaleItem, SalePayment


class CustomerSerializer(serializers.ModelSerializer):
    sales_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "address",
            "notes",
            "is_active",
            "sales_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CustomerWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Customer name cannot be blank.")
        return clean


class CustomerUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160, required=False)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Customer name cannot be blank.")
        return clean


class POSCatalogProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_name_km = serializers.CharField(source="category.name_km", read_only=True)
    unit_abbreviation = serializers.CharField(source="unit.abbreviation", read_only=True)
    unit_allow_decimal = serializers.BooleanField(source="unit.allow_decimal", read_only=True)
    stock_quantity = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "barcode",
            "name",
            "name_km",
            "category",
            "category_name",
            "category_name_km",
            "unit",
            "unit_abbreviation",
            "unit_allow_decimal",
            "selling_price",
            "tax_rate",
            "track_inventory",
            "stock_quantity",
            "image_url",
        ]
        read_only_fields = fields

    def get_stock_quantity(self, obj) -> str:
        bal = getattr(obj, "stock_balance", None)
        if bal is None:
            return "0.000"
        return str(bal.quantity_on_hand)

    def get_image_url(self, obj) -> str | None:
        if not obj.image:
            return None
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = [
            "id",
            "product",
            "product_sku_snapshot",
            "product_name_snapshot",
            "unit_abbreviation_snapshot",
            "quantity",
            "unit_price",
            "unit_cost_snapshot",
            "tax_rate_snapshot",
            "line_subtotal",
            "line_tax",
            "line_total",
        ]
        read_only_fields = fields


class SalePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalePayment
        fields = [
            "id",
            "payment_method",
            "amount",
            "reference_code",
            "created_at",
        ]
        read_only_fields = fields


class SaleListSerializer(serializers.ModelSerializer):
    cashier_username = serializers.CharField(source="cashier.username", read_only=True)
    items_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Sale
        fields = [
            "id",
            "sale_number",
            "customer",
            "customer_name_snapshot",
            "status",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "paid_amount",
            "change_amount",
            "payment_method",
            "items_count",
            "cashier",
            "cashier_username",
            "created_at",
        ]
        read_only_fields = fields


class SaleDetailSerializer(serializers.ModelSerializer):
    cashier_username = serializers.CharField(source="cashier.username", read_only=True)
    cashier_full_name = serializers.SerializerMethodField()
    cancelled_by_username = serializers.CharField(
        source="cancelled_by.username", read_only=True, default=None
    )
    refunded_by_username = serializers.CharField(
        source="refunded_by.username", read_only=True, default=None
    )
    items = SaleItemSerializer(many=True, read_only=True)
    payments = SalePaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id",
            "sale_number",
            "idempotency_key",
            "customer",
            "customer_name_snapshot",
            "status",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "paid_amount",
            "change_amount",
            "payment_method",
            "notes",
            "cashier",
            "cashier_username",
            "cashier_full_name",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "refunded_by",
            "refunded_by_username",
            "refunded_at",
            "refund_reason",
            "items",
            "payments",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_cashier_full_name(self, obj) -> str:
        full = (getattr(obj.cashier, "full_name", "") or "").strip()
        return full or obj.cashier.username


class CheckoutItemInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )


class CheckoutPaymentInputSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(
        choices=[
            (Sale.PaymentMethod.CASH, "Cash"),
            (Sale.PaymentMethod.CARD, "Card"),
            (Sale.PaymentMethod.QR, "QR / KHQR"),
        ]
    )
    amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    reference_code = serializers.CharField(
        max_length=80, required=False, allow_blank=True, default=""
    )


class SaleCheckoutSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
        required=False,
        allow_null=True,
        default=None,
    )
    items = CheckoutItemInputSerializer(many=True, allow_empty=False)
    discount_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        default=Decimal("0.00"),
    )
    tax_rate = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.00"),
        max_value=Decimal("100.00"),
        required=False,
        allow_null=True,
        default=None,
    )
    payment_method = serializers.ChoiceField(
        choices=[
            (Sale.PaymentMethod.CASH, "Cash"),
            (Sale.PaymentMethod.CARD, "Card"),
            (Sale.PaymentMethod.QR, "QR / KHQR"),
        ],
        required=False,
        default=Sale.PaymentMethod.CASH,
    )
    paid_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        allow_null=True,
        default=None,
    )
    payment_reference = serializers.CharField(
        max_length=80, required=False, allow_blank=True, default=""
    )
    payments = CheckoutPaymentInputSerializer(many=True, required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(
        max_length=80, required=False, allow_blank=True, allow_null=True, default=None
    )


class SaleActionReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)

    def validate_reason(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("A reason is required.")
        return clean
