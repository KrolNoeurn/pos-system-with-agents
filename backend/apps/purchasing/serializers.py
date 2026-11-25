"""DRF serializers for Suppliers, Purchases, Purchase Items, and Receiving."""

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Product
from apps.purchasing.models import Purchase, PurchaseItem, Supplier


MAX_SUPPLIER_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB


class MultipartSafeBooleanField(serializers.BooleanField):
    """Preserve omitted boolean fields as empty/default even on multipart/form-data requests."""

    def get_value(self, dictionary):
        if self.field_name not in dictionary:
            return serializers.empty
        return super().get_value(dictionary)


def _validate_supplier_avatar_file(value):
    if value is not None and getattr(value, "size", 0) > MAX_SUPPLIER_AVATAR_BYTES:
        raise serializers.ValidationError("Supplier profile image size must not exceed 5 MB.")
    return value


def _build_media_url(request, file_field) -> str | None:
    if not file_field:
        return None
    if request is not None:
        return request.build_absolute_uri(file_field.url)
    return file_field.url


class SupplierSerializer(serializers.ModelSerializer):
    purchases_count = serializers.IntegerField(read_only=True, default=0)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "contact_name",
            "phone",
            "email",
            "address",
            "avatar",
            "avatar_url",
            "is_active",
            "purchases_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "avatar_url", "purchases_count", "created_at", "updated_at"]

    def get_avatar_url(self, obj) -> str | None:
        return _build_media_url(self.context.get("request"), obj.avatar)


class SupplierWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    avatar = serializers.ImageField(required=False, allow_null=True)
    is_active = MultipartSafeBooleanField(required=False, default=True)

    def validate_avatar(self, value):
        return _validate_supplier_avatar_file(value)


class SupplierUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160, required=False)
    contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    avatar = serializers.ImageField(required=False, allow_null=True)
    remove_avatar = MultipartSafeBooleanField(required=False, default=False)
    is_active = MultipartSafeBooleanField(required=False)

    def validate_avatar(self, value):
        return _validate_supplier_avatar_file(value)


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
    supplier_avatar_url = serializers.SerializerMethodField()
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
            "supplier_avatar_url",
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

    def get_supplier_avatar_url(self, obj) -> str | None:
        supplier = getattr(obj, "supplier", None)
        return _build_media_url(self.context.get("request"), supplier.avatar if supplier else None)


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
