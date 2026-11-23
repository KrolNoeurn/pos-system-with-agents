"""Business services for Expense Categories, Expenses, and Cash Flow aggregation."""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.db import transaction
from django.db.models import Count, DecimalField, ProtectedError, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.audit.services import log_audit_event
from apps.expenses.models import Expense, ExpenseCategory
from apps.purchasing.models import Purchase
from apps.sales.models import Sale

MONEY_QUANT = Decimal("0.01")
MONEY_FIELD = DecimalField(max_digits=14, decimal_places=2)


class ExpenseCategoryInUseError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Expense category cannot be deleted because it is used by existing expenses."
    default_code = "expense_category_in_use"


def _quantize_money(value: Decimal) -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({"amount": ["Enter a valid decimal monetary amount."]})
    quantized = value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    if quantized <= Decimal("0.00"):
        raise ValidationError({"amount": ["Expense amount must be greater than zero."]})
    return quantized


def _generate_expense_number(expense_date: date | None = None) -> str:
    ref_day = (expense_date or timezone.localdate()).strftime("%Y%m%d")
    prefix = f"EXP-{ref_day}-"
    last = (
        Expense.objects.filter(expense_number__startswith=prefix)
        .order_by("-expense_number")
        .values_list("expense_number", flat=True)
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(last.rsplit("-", 1)[-1]) + 1
        except (TypeError, ValueError):
            seq = Expense.objects.filter(expense_number__startswith=prefix).count() + 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def create_expense_category(
    *,
    actor,
    name: str,
    name_km: str = "",
    description: str = "",
    is_active: bool = True,
    ip_address: str | None = None,
) -> ExpenseCategory:
    clean_name = name.strip()
    if not clean_name:
        raise ValidationError({"name": ["Expense category name cannot be blank."]})
    if ExpenseCategory.objects.filter(name__iexact=clean_name).exists():
        raise ValidationError({"name": ["An expense category with this name already exists."]})

    category = ExpenseCategory.objects.create(
        name=clean_name,
        name_km=(name_km or "").strip(),
        description=(description or "").strip(),
        is_active=is_active,
    )
    log_audit_event(
        actor=actor,
        action="expense_category.created",
        target_type="ExpenseCategory",
        target_id=category.id,
        ip_address=ip_address,
        metadata={"name": category.name},
    )
    return category


@transaction.atomic
def update_expense_category(
    *,
    actor,
    category: ExpenseCategory,
    name: str | None = None,
    name_km: str | None = None,
    description: str | None = None,
    is_active: bool | None = None,
    ip_address: str | None = None,
) -> ExpenseCategory:
    changed_fields: list[str] = []

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise ValidationError({"name": ["Expense category name cannot be blank."]})
        if (
            ExpenseCategory.objects.filter(name__iexact=clean_name)
            .exclude(pk=category.pk)
            .exists()
        ):
            raise ValidationError({"name": ["An expense category with this name already exists."]})
        if clean_name != category.name:
            category.name = clean_name
            changed_fields.append("name")

    if name_km is not None:
        clean_km = name_km.strip()
        if clean_km != category.name_km:
            category.name_km = clean_km
            changed_fields.append("name_km")

    if description is not None:
        clean_desc = description.strip()
        if clean_desc != category.description:
            category.description = clean_desc
            changed_fields.append("description")

    if is_active is not None and is_active != category.is_active:
        category.is_active = is_active
        changed_fields.append("is_active")

    if changed_fields:
        category.save(update_fields=[*changed_fields, "updated_at"])
        log_audit_event(
            actor=actor,
            action="expense_category.updated",
            target_type="ExpenseCategory",
            target_id=category.id,
            ip_address=ip_address,
            metadata={"changed_fields": changed_fields, "name": category.name},
        )
    return category


@transaction.atomic
def delete_expense_category(
    *,
    actor,
    category: ExpenseCategory,
    ip_address: str | None = None,
) -> None:
    if category.expenses.exists():
        raise ExpenseCategoryInUseError(
            f"Expense category '{category.name}' cannot be deleted because it has recorded expenses."
        )
    cat_id = category.id
    cat_name = category.name
    try:
        category.delete()
    except ProtectedError as exc:
        raise ExpenseCategoryInUseError(
            f"Expense category '{cat_name}' is referenced by protected expense records."
        ) from exc

    log_audit_event(
        actor=actor,
        action="expense_category.deleted",
        target_type="ExpenseCategory",
        target_id=cat_id,
        ip_address=ip_address,
        metadata={"name": cat_name},
    )


@transaction.atomic
def create_expense(
    *,
    actor,
    category: ExpenseCategory,
    title: str,
    amount: Decimal,
    expense_date: date,
    payment_method: str = Expense.PaymentMethod.CASH,
    reference_code: str = "",
    vendor_name: str = "",
    notes: str = "",
    ip_address: str | None = None,
) -> Expense:
    if not category.is_active:
        raise ValidationError({"category": ["Selected expense category is inactive."]})

    clean_title = title.strip()
    if not clean_title:
        raise ValidationError({"title": ["Expense title cannot be blank."]})

    clean_amount = _quantize_money(amount)
    if payment_method not in Expense.PaymentMethod.values:
        raise ValidationError({"payment_method": ["Unsupported payment method."]})

    expense = Expense.objects.create(
        expense_number=_generate_expense_number(expense_date),
        category=category,
        title=clean_title,
        amount=clean_amount,
        expense_date=expense_date,
        payment_method=payment_method,
        reference_code=(reference_code or "").strip(),
        vendor_name=(vendor_name or "").strip(),
        notes=(notes or "").strip(),
        created_by=actor,
    )
    log_audit_event(
        actor=actor,
        action="expense.created",
        target_type="Expense",
        target_id=expense.id,
        ip_address=ip_address,
        metadata={
            "expense_number": expense.expense_number,
            "category_id": expense.category_id,
            "title": expense.title,
            "amount": str(expense.amount),
            "expense_date": str(expense.expense_date),
            "payment_method": expense.payment_method,
        },
    )
    return expense


@transaction.atomic
def update_expense(
    *,
    actor,
    expense: Expense,
    category: ExpenseCategory | None = None,
    title: str | None = None,
    amount: Decimal | None = None,
    expense_date: date | None = None,
    payment_method: str | None = None,
    reference_code: str | None = None,
    vendor_name: str | None = None,
    notes: str | None = None,
    ip_address: str | None = None,
) -> Expense:
    changed_fields: list[str] = []
    previous_amount = str(expense.amount)

    if category is not None and category.id != expense.category_id:
        if not category.is_active:
            raise ValidationError({"category": ["Selected expense category is inactive."]})
        expense.category = category
        changed_fields.append("category")

    if title is not None:
        clean_title = title.strip()
        if not clean_title:
            raise ValidationError({"title": ["Expense title cannot be blank."]})
        if clean_title != expense.title:
            expense.title = clean_title
            changed_fields.append("title")

    if amount is not None:
        clean_amount = _quantize_money(amount)
        if clean_amount != expense.amount:
            expense.amount = clean_amount
            changed_fields.append("amount")

    if expense_date is not None and expense_date != expense.expense_date:
        expense.expense_date = expense_date
        changed_fields.append("expense_date")

    if payment_method is not None and payment_method != expense.payment_method:
        if payment_method not in Expense.PaymentMethod.values:
            raise ValidationError({"payment_method": ["Unsupported payment method."]})
        expense.payment_method = payment_method
        changed_fields.append("payment_method")

    if reference_code is not None:
        clean_ref = reference_code.strip()
        if clean_ref != expense.reference_code:
            expense.reference_code = clean_ref
            changed_fields.append("reference_code")

    if vendor_name is not None:
        clean_vendor = vendor_name.strip()
        if clean_vendor != expense.vendor_name:
            expense.vendor_name = clean_vendor
            changed_fields.append("vendor_name")

    if notes is not None:
        clean_notes = notes.strip()
        if clean_notes != expense.notes:
            expense.notes = clean_notes
            changed_fields.append("notes")

    if changed_fields:
        expense.updated_by = actor
        expense.save(update_fields=[*changed_fields, "updated_by", "updated_at"])
        log_audit_event(
            actor=actor,
            action="expense.updated",
            target_type="Expense",
            target_id=expense.id,
            ip_address=ip_address,
            metadata={
                "expense_number": expense.expense_number,
                "changed_fields": changed_fields,
                "previous_amount": previous_amount,
                "amount": str(expense.amount),
            },
        )
    return expense


@transaction.atomic
def delete_expense(
    *,
    actor,
    expense: Expense,
    ip_address: str | None = None,
) -> None:
    snapshot = {
        "expense_number": expense.expense_number,
        "category_id": expense.category_id,
        "category_name": expense.category.name,
        "title": expense.title,
        "amount": str(expense.amount),
        "expense_date": str(expense.expense_date),
        "payment_method": expense.payment_method,
        "reference_code": expense.reference_code,
    }
    expense_id = expense.id
    expense.delete()
    log_audit_event(
        actor=actor,
        action="expense.deleted",
        target_type="Expense",
        target_id=expense_id,
        ip_address=ip_address,
        metadata=snapshot,
    )


def get_cash_flow_summary(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    """Compute exact Decimal cash-flow summary combining Sales, Received Purchases, and Expenses."""
    expenses_qs = Expense.objects.select_related("category").all()
    sales_qs = Sale.objects.filter(status=Sale.Status.COMPLETED)
    purchases_qs = Purchase.objects.filter(status=Purchase.Status.RECEIVED)

    if date_from is not None:
        expenses_qs = expenses_qs.filter(expense_date__gte=date_from)
        sales_qs = sales_qs.filter(created_at__date__gte=date_from)
        purchases_qs = purchases_qs.filter(received_at__date__gte=date_from)

    if date_to is not None:
        expenses_qs = expenses_qs.filter(expense_date__lte=date_to)
        sales_qs = sales_qs.filter(created_at__date__lte=date_to)
        purchases_qs = purchases_qs.filter(received_at__date__lte=date_to)

    zero_val = Value(Decimal("0.00"), output_field=MONEY_FIELD)

    expense_agg = expenses_qs.aggregate(
        total=Coalesce(Sum("amount"), zero_val),
        count=Count("id"),
    )
    sales_agg = sales_qs.aggregate(
        total=Coalesce(Sum("total_amount"), zero_val),
        count=Count("id"),
    )
    purchases_agg = purchases_qs.aggregate(
        total=Coalesce(Sum("total_amount"), zero_val),
        count=Count("id"),
    )

    sales_inflow = sales_agg["total"].quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    purchasing_outflow = purchases_agg["total"].quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    expense_outflow = expense_agg["total"].quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    total_outflow = (purchasing_outflow + expense_outflow).quantize(
        MONEY_QUANT, rounding=ROUND_HALF_UP
    )
    net_cash_flow = (sales_inflow - total_outflow).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

    by_category = [
        {
            "category_id": row["category_id"],
            "category_name": row["category__name"],
            "category_name_km": row["category__name_km"],
            "count": row["count"],
            "total_amount": str(row["total_amount"].quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)),
        }
        for row in expenses_qs.values("category_id", "category__name", "category__name_km")
        .annotate(
            count=Count("id"),
            total_amount=Coalesce(Sum("amount"), zero_val),
        )
        .order_by("-total_amount", "category__name")
    ]

    by_payment_method = [
        {
            "payment_method": row["payment_method"],
            "count": row["count"],
            "total_amount": str(row["total_amount"].quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)),
        }
        for row in expenses_qs.values("payment_method")
        .annotate(
            count=Count("id"),
            total_amount=Coalesce(Sum("amount"), zero_val),
        )
        .order_by("-total_amount", "payment_method")
    ]

    return {
        "filters": {
            "date_from": str(date_from) if date_from else None,
            "date_to": str(date_to) if date_to else None,
        },
        "cash_flow": {
            "sales_inflow": str(sales_inflow),
            "sales_count": sales_agg["count"],
            "purchasing_outflow": str(purchasing_outflow),
            "purchases_count": purchases_agg["count"],
            "expense_outflow": str(expense_outflow),
            "expenses_count": expense_agg["count"],
            "total_outflow": str(total_outflow),
            "net_cash_flow": str(net_cash_flow),
        },
        "by_category": by_category,
        "by_payment_method": by_payment_method,
    }
