"""DRF serializers for Catalog Categories, Units, and Products."""

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Category, Product, Unit


class CategorySerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source="parent.name", read_only=True, default=None)
    children_count = serializers.IntegerField(read_only=True, default=0)
    products_count = serializers.IntegerField(read_only=True, default=0)
    is_in_use = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "name_km",
            "slug",
            "parent",
            "parent_name",
            "description",
            "is_active",
            "children_count",
            "products_count",
            "is_in_use",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "parent_name",
            "children_count",
            "products_count",
            "is_in_use",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "slug": {"required": False, "allow_blank": True},
        }

    def get_is_in_use(self, obj) -> bool:
        children_count = getattr(obj, "children_count", None)
        products_count = getattr(obj, "products_count", None)
        if children_count is not None and products_count is not None:
            return (children_count + products_count) > 0
        return obj.children.exists() or obj.products.exists()


class CategoryWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    name_km = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    slug = serializers.CharField(max_length=140, required=False, allow_blank=True)
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )
    description = serializers.CharField(required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Category name cannot be blank.")
        return clean


class CategoryUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    name_km = serializers.CharField(max_length=150, required=False, allow_blank=True)
    slug = serializers.CharField(max_length=140, required=False, allow_blank=True)
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )
    description = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Category name cannot be blank.")
        return clean


class UnitSerializer(serializers.ModelSerializer):
    base_unit_name = serializers.CharField(source="base_unit.name", read_only=True, default=None)
    base_unit_abbreviation = serializers.CharField(
        source="base_unit.abbreviation", read_only=True, default=None
    )
    derived_count = serializers.IntegerField(read_only=True, default=0)
    products_count = serializers.IntegerField(read_only=True, default=0)
    is_in_use = serializers.SerializerMethodField()

    class Meta:
        model = Unit
        fields = [
            "id",
            "name",
            "name_km",
            "abbreviation",
            "unit_type",
            "allow_decimal",
            "base_unit",
            "base_unit_name",
            "base_unit_abbreviation",
            "conversion_factor",
            "is_active",
            "derived_count",
            "products_count",
            "is_in_use",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "base_unit_name",
            "base_unit_abbreviation",
            "derived_count",
            "products_count",
            "is_in_use",
            "created_at",
            "updated_at",
        ]

    def get_is_in_use(self, obj) -> bool:
        derived_count = getattr(obj, "derived_count", None)
        products_count = getattr(obj, "products_count", None)
        if derived_count is not None and products_count is not None:
            return (derived_count + products_count) > 0
        return obj.derived_units.exists() or obj.products.exists()


class UnitWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    name_km = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    abbreviation = serializers.CharField(max_length=20)
    unit_type = serializers.ChoiceField(choices=Unit.UnitType.choices, default=Unit.UnitType.COUNT)
    allow_decimal = serializers.BooleanField(required=False, default=False)
    base_unit = serializers.PrimaryKeyRelatedField(
        queryset=Unit.objects.all(),
        required=False,
        allow_null=True,
    )
    conversion_factor = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        required=False,
        default=Decimal("1.000000"),
    )
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Unit name cannot be blank.")
        return clean

    def validate_abbreviation(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Abbreviation cannot be blank.")
        return clean


class UnitUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=False)
    name_km = serializers.CharField(max_length=120, required=False, allow_blank=True)
    abbreviation = serializers.CharField(max_length=20, required=False)
    unit_type = serializers.ChoiceField(choices=Unit.UnitType.choices, required=False)
    allow_decimal = serializers.BooleanField(required=False)
    base_unit = serializers.PrimaryKeyRelatedField(
        queryset=Unit.objects.all(),
        required=False,
        allow_null=True,
    )
    conversion_factor = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        required=False,
    )
    is_active = serializers.BooleanField(required=False)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Unit name cannot be blank.")
        return clean

    def validate_abbreviation(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Abbreviation cannot be blank.")
        return clean


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_name_km = serializers.CharField(source="category.name_km", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    unit_abbreviation = serializers.CharField(source="unit.abbreviation", read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "barcode",
            "name",
            "name_km",
            "description",
            "image",
            "image_url",
            "category",
            "category_name",
            "category_name_km",
            "unit",
            "unit_name",
            "unit_abbreviation",
            "purchase_cost",
            "selling_price",
            "wholesale_price",
            "tax_rate",
            "min_stock_threshold",
            "track_inventory",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_image_url(self, obj) -> str | None:
        if not obj.image:
            return None
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class NullableDecimalField(serializers.DecimalField):
    """Treat empty strings from multipart FormData as None for optional decimals."""

    def to_internal_value(self, data):
        if data == "":
            return None
        return super().to_internal_value(data)


class ProductWriteSerializer(serializers.Serializer):
    sku = serializers.CharField(max_length=64)
    barcode = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    name = serializers.CharField(max_length=180)
    name_km = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    image = serializers.ImageField(required=False, allow_null=True)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.all())
    purchase_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        default=Decimal("0.00"),
    )
    selling_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )
    wholesale_price = NullableDecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        allow_null=True,
    )
    tax_rate = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.00"),
        max_value=Decimal("100.00"),
        required=False,
        default=Decimal("0.00"),
    )
    min_stock_threshold = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        min_value=Decimal("0.000"),
        required=False,
        default=Decimal("0.000"),
    )
    track_inventory = serializers.BooleanField(required=False, default=True)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_sku(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("SKU cannot be blank.")
        return clean

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Product name cannot be blank.")
        return clean


class ProductUpdateSerializer(serializers.Serializer):
    sku = serializers.CharField(max_length=64, required=False)
    barcode = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    name = serializers.CharField(max_length=180, required=False)
    name_km = serializers.CharField(max_length=200, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    image = serializers.ImageField(required=False, allow_null=True)
    remove_image = serializers.BooleanField(required=False, default=False)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), required=False)
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.all(), required=False)
    purchase_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
    )
    selling_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
    )
    wholesale_price = NullableDecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        allow_null=True,
    )
    tax_rate = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.00"),
        max_value=Decimal("100.00"),
        required=False,
    )
    min_stock_threshold = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        min_value=Decimal("0.000"),
        required=False,
    )
    track_inventory = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_sku(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("SKU cannot be blank.")
        return clean

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Product name cannot be blank.")
        return clean
