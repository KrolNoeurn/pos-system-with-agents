"""Sales, POS checkout line items, payments, and Customer directory models."""

from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.catalog.models import Product


class Customer(models.Model):
    """Customer directory record linked optionally to POS sales."""

    name = models.CharField(max_length=160, db_index=True)
    phone = models.CharField(max_length=40, blank=True, default="", db_index=True)
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    avatar = models.ImageField(upload_to="customers/avatars/%Y/%m/", null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_customers",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "customers"
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return self.name


class Sale(models.Model):
    """
    Immutable POS sale header with server-calculated Decimal totals,
    payment reconciliation, idempotency protection, and audit metadata.
    """

    class Status(models.TextChoices):
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        QR = "qr", "QR / KHQR"
        SPLIT = "split", "Split Payment"

    class DiscountType(models.TextChoices):
        FIXED = "fixed", "Fixed Cash"
        PERCENT = "percent", "Percentage"

    sale_number = models.CharField(max_length=40, unique=True, db_index=True)
    idempotency_key = models.CharField(
        max_length=80,
        null=True,
        blank=True,
        unique=True,
        db_index=True,
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sales",
    )
    customer_name_snapshot = models.CharField(max_length=160, default="Walk-in Customer")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.COMPLETED,
        db_index=True,
    )

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    item_discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    order_discount_type = models.CharField(
        max_length=12,
        choices=DiscountType.choices,
        default=DiscountType.FIXED,
    )
    order_discount_value = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    order_discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    paid_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    change_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")

    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cashier_sales",
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_sales",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.TextField(blank=True, default="")

    refunded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="refunded_sales",
    )
    refunded_at = models.DateTimeField(null=True, blank=True)
    refund_reason = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sales_sales"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(subtotal__gte=Decimal("0.00")),
                name="ck_sales_sale_subtotal_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(discount_amount__gte=Decimal("0.00")),
                name="ck_sales_sale_discount_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(tax_amount__gte=Decimal("0.00")),
                name="ck_sales_sale_tax_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(total_amount__gte=Decimal("0.00")),
                name="ck_sales_sale_total_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(paid_amount__gte=Decimal("0.00")),
                name="ck_sales_sale_paid_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(change_amount__gte=Decimal("0.00")),
                name="ck_sales_sale_change_gte_zero",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.sale_number} ({self.status})"


class SaleItem(models.Model):
    """Immutable snapshot of a product line item sold in a POS transaction."""

    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="sale_items",
    )

    product_sku_snapshot = models.CharField(max_length=64)
    product_name_snapshot = models.CharField(max_length=180)
    unit_abbreviation_snapshot = models.CharField(max_length=20)

    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    tax_rate_snapshot = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    line_subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    discount_type = models.CharField(
        max_length=12,
        choices=Sale.DiscountType.choices,
        default=Sale.DiscountType.FIXED,
    )
    discount_value = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    line_discount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    line_tax = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    line_total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "sales_sale_items"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["sale", "product"],
                name="uq_sales_item_sale_product",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gt=Decimal("0.000")),
                name="ck_sales_item_quantity_gt_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_price__gte=Decimal("0.00")),
                name="ck_sales_item_unit_price_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost_snapshot__gte=Decimal("0.00")),
                name="ck_sales_item_unit_cost_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(line_subtotal__gte=Decimal("0.00")),
                name="ck_sales_item_line_subtotal_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(discount_value__gte=Decimal("0.00")),
                name="ck_sales_item_discount_value_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(line_discount__gte=Decimal("0.00")),
                name="ck_sales_item_line_discount_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(line_tax__gte=Decimal("0.00")),
                name="ck_sales_item_line_tax_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(line_total__gte=Decimal("0.00")),
                name="ck_sales_item_line_total_gte_zero",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.sale.sale_number} — {self.product_sku_snapshot} x {self.quantity}"


class SalePayment(models.Model):
    """Payment tender record associated with a POS sale (supports single or split payments)."""

    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    payment_method = models.CharField(
        max_length=20,
        choices=[
            (Sale.PaymentMethod.CASH, "Cash"),
            (Sale.PaymentMethod.CARD, "Card"),
            (Sale.PaymentMethod.QR, "QR / KHQR"),
        ],
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reference_code = models.CharField(max_length=80, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sales_payments"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=Decimal("0.00")),
                name="ck_sales_payment_amount_gt_zero",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.sale.sale_number} — {self.payment_method} {self.amount}"
