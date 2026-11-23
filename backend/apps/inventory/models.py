"""Inventory balance and append-only stock movement ledger models."""

from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.catalog.models import Product


class StockBalance(models.Model):
    """
    Current stock on hand and moving average unit cost for a tracked product.

    This table MUST only be mutated by `apps.inventory.services` alongside a
    corresponding `StockMovement` row inside `transaction.atomic()`.
    """

    product = models.OneToOneField(
        Product,
        on_delete=models.PROTECT,
        related_name="stock_balance",
    )
    quantity_on_hand = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=Decimal("0.000"),
    )
    average_unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_stock_balances"
        ordering = ["product__name", "id"]

    def __str__(self) -> str:
        return f"{self.product.sku}: {self.quantity_on_hand}"


class StockMovement(models.Model):
    """Immutable, append-only ledger of every inventory change."""

    class MovementType(models.TextChoices):
        OPENING = "opening", "Opening Stock"
        STOCK_IN = "stock_in", "Stock In"
        STOCK_OUT = "stock_out", "Stock Out"
        ADJUSTMENT = "adjustment", "Stock Adjustment"
        SALE = "sale", "Sale"
        PURCHASE = "purchase", "Purchase"
        REFUND = "refund", "Refund"
        VOID = "void", "Void / Cancellation"

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    movement_type = models.CharField(
        max_length=20,
        choices=MovementType.choices,
        db_index=True,
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    quantity_delta = models.DecimalField(max_digits=14, decimal_places=3)
    balance_before = models.DecimalField(max_digits=14, decimal_places=3)
    balance_after = models.DecimalField(max_digits=14, decimal_places=3)

    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    total_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    reference_type = models.CharField(max_length=50, blank=True, default="", db_index=True)
    reference_code = models.CharField(max_length=80, blank=True, default="", db_index=True)
    notes = models.TextField(blank=True, default="")

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "inventory_stock_movements"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=Decimal("0.000")),
                name="ck_inventory_movement_quantity_gt_zero",
            ),
            models.CheckConstraint(
                condition=~models.Q(quantity_delta=Decimal("0.000")),
                name="ck_inventory_movement_delta_nonzero",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gte=Decimal("0.00")),
                name="ck_inventory_movement_unit_cost_gte_zero",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.movement_type} {self.quantity_delta:+} {self.product.sku}"
