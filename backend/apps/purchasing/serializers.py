"""DRF serializers for Suppliers, Purchases, Purchase Items, and Receiving."""

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Product
from apps.purchasing.models import Purchase, PurchaseItem, Supplier


class SupplierSerializer(serializers.ModelSerializer):
    purchases_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "contact_name",
            "phone",
            "email",
            "address",
            "is_active",
            "purchases_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "purchases_count", "created_at", "updated_at"]


class SupplierWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False, default=True)


class SupplierUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160, required=False)
    contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)


class PurchaseItemReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseItem
        fields = [
            "id",
            "product",
            "product_sku_snapshot",
            "product_name_snapshot",
            "unit_abbreviation_snapshot",
            "quantity",
            "unit_cost",
            "line_total",
        ]
        read_only_fields = fields


class PurchaseListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    received_by_username = serializers.CharField(
        source="received_by.username", read_only=True, default=None
    )
    items_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Purchase
        fields = [
            "id",
            "purchase_number",
            "supplier",
            "supplier_name",
            "status",
            "purchase_date",
            "expected_date",
            "subtotal",
            "discount_amount",
            "total_amount",
            "items_count",
            "created_by",
            "created_by_username",
            "received_by",
            "received_by_username",
            "received_at",
            "cancelled_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PurchaseDetailSerializer(PurchaseListSerializer):
    items = PurchaseItemReadSerializer(many=True, read_only=True)
    cancelled_by_username = serializers.CharField(
        source="cancelled_by.username", read_only=True, default=None
    )

    class Meta(PurchaseListSerializer.Meta):
        fields = [
            *PurchaseListSerializer.Meta.fields,
            "notes",
            "cancelled_by",
            "cancelled_by_username",
            "cancellation_reason",
            "items",
        ]
        read_only_fields = fields


class PurchaseItemInputSerializer(serializers.Serializer):
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
    )


class PurchaseCreateSerializer(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    purchase_date = serializers.DateField(required=False)
    expected_date = serializers.DateField(required=False, allow_null=True)
    discount_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        default=Decimal("0.00"),
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(
        choices=[Purchase.Status.DRAFT, Purchase.Status.ORDERED],
        required=False,
        default=Purchase.Status.DRAFT,
    )
    items = PurchaseItemInputSerializer(many=True, allow_empty=False)


class PurchaseUpdateSerializer(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all(), required=False)
    purchase_date = serializers.DateField(required=False)
    expected_date = serializers.DateField(required=False, allow_null=True)
    discount_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(
        choices=[Purchase.Status.DRAFT, Purchase.Status.ORDERED],
        required=False,
    )
    items = PurchaseItemInputSerializer(many=True, allow_empty=False, required=False)


class PurchaseReceiveSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class PurchaseCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
