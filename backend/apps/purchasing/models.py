"""Supplier, Purchase Order, and PurchaseItem models with historical snapshots."""

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalog.models import Product


class Supplier(models.Model):
    name = models.CharField(max_length=160, unique=True, db_index=True)
    contact_name = models.CharField(max_length=120, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="", db_index=True)
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    avatar = models.ImageField(upload_to="suppliers/avatars/%Y/%m/", null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "suppliers"
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return self.name


class Purchase(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ORDERED = "ordered", "Ordered"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    purchase_number = models.CharField(max_length=40, unique=True, db_index=True)
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchases",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    purchase_date = models.DateField(default=timezone.localdate)
    expected_date = models.DateField(null=True, blank=True)

    subtotal = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    discount_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    notes = models.TextField(blank=True, default="")

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_purchases",
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="received_purchases",
    )
    received_at = models.DateTimeField(null=True, blank=True)

    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_purchases",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "purchasing_purchases"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(subtotal__gte=Decimal("0.00")),
                name="ck_purchasing_subtotal_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(discount_amount__gte=Decimal("0.00")),
                name="ck_purchasing_discount_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(total_amount__gte=Decimal("0.00")),
                name="ck_purchasing_total_gte_zero",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.purchase_number} ({self.status})"


class PurchaseItem(models.Model):
    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="purchase_items",
    )
    product_sku_snapshot = models.CharField(max_length=64)
    product_name_snapshot = models.CharField(max_length=180)
    unit_abbreviation_snapshot = models.CharField(max_length=20)

    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    line_total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "purchasing_purchase_items"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["purchase", "product"],
                name="uq_purchasing_item_purchase_product",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gt=Decimal("0.000")),
                name="ck_purchasing_item_qty_gt_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gte=Decimal("0.00")),
                name="ck_purchasing_item_cost_gte_zero",
            ),
            models.CheckConstraint(
                condition=models.Q(line_total__gte=Decimal("0.00")),
                name="ck_purchasing_item_line_total_gte_zero",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.purchase.purchase_number}: {self.product_sku_snapshot} x {self.quantity}"
