"""Catalog domain models — Categories, Units of Measure, and Products."""

from decimal import Decimal

from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=120, unique=True, db_index=True)
    name_km = models.CharField(max_length=150, blank=True, default="")
    slug = models.SlugField(max_length=140, unique=True, db_index=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
    )
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalog_categories"
        ordering = ["name"]
        verbose_name_plural = "Categories"

    def __str__(self) -> str:
        return self.name


class Unit(models.Model):
    class UnitType(models.TextChoices):
        COUNT = "count", "Count"
        WEIGHT = "weight", "Weight"
        VOLUME = "volume", "Volume"
        LENGTH = "length", "Length"
        OTHER = "other", "Other"

    name = models.CharField(max_length=100, unique=True, db_index=True)
    name_km = models.CharField(max_length=120, blank=True, default="")
    abbreviation = models.CharField(max_length=20, unique=True, db_index=True)
    unit_type = models.CharField(
        max_length=20,
        choices=UnitType.choices,
        default=UnitType.COUNT,
        db_index=True,
    )
    allow_decimal = models.BooleanField(default=False)

    # Extensible conversion foundation (e.g., Box -> 12 pcs, kg -> 1000 g).
    base_unit = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="derived_units",
    )
    conversion_factor = models.DecimalField(
        max_digits=14,
        decimal_places=6,
        default=Decimal("1.000000"),
    )

    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalog_units"
        ordering = ["name", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(conversion_factor__gt=Decimal("0")),
                name="ck_catalog_unit_conversion_factor_gt_zero",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.abbreviation})"


class Product(models.Model):
    """
    Catalog product definition.

    Stock quantities are intentionally NOT stored as editable fields here;
    inventory balances must be controlled through the inventory movement system.
    """

    sku = models.CharField(max_length=64, unique=True, db_index=True)
    barcode = models.CharField(max_length=64, null=True, blank=True, unique=True, db_index=True)
    name = models.CharField(max_length=180, db_index=True)
    name_km = models.CharField(max_length=200, blank=True, default="")
    description = models.TextField(blank=True, default="")
    image = models.ImageField(upload_to="products/%Y/%m/", null=True, blank=True)

    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="products",
    )
    unit = models.ForeignKey(
        Unit,
        on_delete=models.PROTECT,
        related_name="products",
    )

    purchase_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )
    wholesale_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    min_stock_threshold = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=Decimal("0.000"),
    )
    track_inventory = models.BooleanField(default=True)

    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalog_products"
        ordering = ["name", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(purchase_cost__gte=Decimal("0.00")),
                name="ck_catalog_product_purchase_cost_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(selling_price__gte=Decimal("0.00")),
                name="ck_catalog_product_selling_price_gte_zero",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(wholesale_price__isnull=True)
                    | models.Q(wholesale_price__gte=Decimal("0.00"))
                ),
                name="ck_catalog_product_wholesale_price_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(min_stock_threshold__gte=Decimal("0.000")),
                name="ck_catalog_product_min_stock_gte_zero",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(tax_rate__gte=Decimal("0.00"))
                    & models.Q(tax_rate__lte=Decimal("100.00"))
                ),
                name="ck_catalog_product_tax_rate_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.sku} — {self.name}"
