"""Operating expense categories and expense records for POS cash-flow tracking."""

from decimal import Decimal

from django.conf import settings
from django.db import models


class ExpenseCategory(models.Model):
    """Categorization for operating expenses (e.g., Rent, Utilities, Payroll, Supplies)."""

    name = models.CharField(max_length=120, unique=True, db_index=True)
    name_km = models.CharField(max_length=150, blank=True, default="")
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "expense_categories"
        ordering = ["name", "id"]
        verbose_name_plural = "Expense Categories"

    def __str__(self) -> str:
        return self.name


class Expense(models.Model):
    """Audited business expense record using exact Decimal monetary values."""

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        CARD = "card", "Card"
        QR = "qr", "QR / KHQR"
        OTHER = "other", "Other"

    expense_number = models.CharField(max_length=40, unique=True, db_index=True)
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name="expenses",
    )
    title = models.CharField(max_length=180, db_index=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    expense_date = models.DateField(db_index=True)
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
        db_index=True,
    )
    reference_code = models.CharField(max_length=80, blank=True, default="", db_index=True)
    vendor_name = models.CharField(max_length=160, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_expenses",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="updated_expenses",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "expenses"
        ordering = ["-expense_date", "-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=Decimal("0.00")),
                name="ck_expenses_expense_amount_gt_zero",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.expense_number} — {self.title} ({self.amount})"
