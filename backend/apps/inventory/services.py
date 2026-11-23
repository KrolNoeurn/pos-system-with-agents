"""Transactional inventory movement, balance synchronization, and valuation services."""

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.audit.services import log_audit_event
from apps.catalog.models import Product
from apps.inventory.models import StockBalance, StockMovement

QTY_QUANT = Decimal("0.001")
MONEY_QUANT = Decimal("0.01")

INBOUND_MOVEMENT_TYPES = {
    StockMovement.MovementType.OPENING,
    StockMovement.MovementType.STOCK_IN,
    StockMovement.MovementType.PURCHASE,
    StockMovement.MovementType.REFUND,
    StockMovement.MovementType.VOID,
}

OUTBOUND_MOVEMENT_TYPES = {
    StockMovement.MovementType.STOCK_OUT,
    StockMovement.MovementType.SALE,
}


class OpeningStockAlreadyExistsError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Opening stock cannot be recorded because this product already has inventory movements."
    default_code = "opening_stock_exists"


def _quantize_qty(value: Decimal) -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({"quantity": ["Enter a valid decimal quantity."]})
    return value.quantize(QTY_QUANT, rounding=ROUND_HALF_UP)


def _quantize_money(value: Decimal, field_name: str = "unit_cost") -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({field_name: ["Enter a valid decimal monetary amount."]})
    if value < Decimal("0.00"):
        raise ValidationError({field_name: ["Unit cost cannot be negative."]})
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _lock_or_create_balance(product: Product) -> StockBalance:
    """Fetch and lock StockBalance row safely under concurrent first-movement creation."""
    balance = StockBalance.objects.select_for_update().filter(product=product).first()
    if balance is not None:
        return balance

    try:
        with transaction.atomic():
            StockBalance.objects.create(
                product=product,
                quantity_on_hand=Decimal("0.000"),
                average_unit_cost=product.purchase_cost,
            )
    except IntegrityError:
        # Another concurrent transaction created the initial balance row first.
        pass

    return StockBalance.objects.select_for_update().get(product=product)


@transaction.atomic
def record_stock_movement(
    *,
    actor,
    product: Product,
    movement_type: str,
    quantity: Decimal,
    direction: str | None = None,
    unit_cost: Decimal | None = None,
    reference_type: str = "MANUAL",
    reference_code: str = "",
    notes: str = "",
    ip_address: str | None = None,
) -> StockMovement:
    """
    Atomically validate and record a StockMovement while updating StockBalance
    and moving-average valuation.
    """
    product = Product.objects.select_related("unit").get(pk=product.pk)

    if not product.track_inventory:
        raise ValidationError(
            {"product": ["Inventory tracking is disabled for this product."]}
        )

    clean_qty = _quantize_qty(quantity)
    if clean_qty <= Decimal("0.000"):
        raise ValidationError({"quantity": ["Quantity must be greater than zero."]})

    if not product.unit.allow_decimal and clean_qty != clean_qty.to_integral_value():
        raise ValidationError(
            {
                "quantity": [
                    f"Unit '{product.unit.abbreviation}' does not allow decimal quantities."
                ]
            }
        )

    clean_notes = (notes or "").strip()
    clean_ref_type = (reference_type or "MANUAL").strip().upper()
    clean_ref_code = (reference_code or "").strip()

    if movement_type == StockMovement.MovementType.ADJUSTMENT and not clean_notes:
        raise ValidationError(
            {"notes": ["A reason/note is required for stock adjustments."]}
        )

    # Determine signed delta
    if movement_type in INBOUND_MOVEMENT_TYPES:
        delta = clean_qty
    elif movement_type in OUTBOUND_MOVEMENT_TYPES:
        delta = -clean_qty
    elif movement_type == StockMovement.MovementType.ADJUSTMENT:
        if direction == "increase":
            delta = clean_qty
        elif direction == "decrease":
            delta = -clean_qty
        else:
            raise ValidationError(
                {"direction": ["Direction must be 'increase' or 'decrease' for adjustments."]}
            )
    else:
        raise ValidationError({"movement_type": ["Unsupported movement type."]})

    # Acquire row lock on StockBalance
    balance = _lock_or_create_balance(product)

    if movement_type == StockMovement.MovementType.OPENING:
        if StockMovement.objects.filter(product=product).exists():
            raise OpeningStockAlreadyExistsError(
                f"Opening stock already recorded or stock movements already exist for '{product.sku}'."
            )

    balance_before = balance.quantity_on_hand
    balance_after = _quantize_qty(balance_before + delta)

    allow_negative = getattr(settings, "INVENTORY_ALLOW_NEGATIVE_STOCK", False)
    if balance_after < Decimal("0.000") and not allow_negative:
        raise ValidationError(
            {
                "quantity": [
                    f"Insufficient stock for '{product.sku}'. Available: {balance_before}, requested deduction: {clean_qty}."
                ]
            }
        )

    # Moving weighted average cost valuation
    current_avg_cost = balance.average_unit_cost
    if delta > Decimal("0.000"):
        effective_unit_cost = (
            _quantize_money(unit_cost) if unit_cost is not None else product.purchase_cost
        )
        if balance_before > Decimal("0.000") and balance_after > Decimal("0.000"):
            total_existing_value = balance_before * current_avg_cost
            total_incoming_value = clean_qty * effective_unit_cost
            new_avg_cost = (
                (total_existing_value + total_incoming_value) / balance_after
            ).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        else:
            new_avg_cost = effective_unit_cost
    else:
        effective_unit_cost = (
            _quantize_money(unit_cost)
            if unit_cost is not None
            else (current_avg_cost if current_avg_cost > Decimal("0.00") else product.purchase_cost)
        )
        new_avg_cost = current_avg_cost

    total_cost = (clean_qty * effective_unit_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

    balance.quantity_on_hand = balance_after
    balance.average_unit_cost = new_avg_cost
    balance.save(update_fields=["quantity_on_hand", "average_unit_cost", "updated_at"])

    movement = StockMovement.objects.create(
        product=product,
        movement_type=movement_type,
        quantity=clean_qty,
        quantity_delta=delta,
        balance_before=balance_before,
        balance_after=balance_after,
        unit_cost=effective_unit_cost,
        total_cost=total_cost,
        reference_type=clean_ref_type,
        reference_code=clean_ref_code,
        notes=clean_notes,
        created_by=actor,
    )

    log_audit_event(
        actor=actor,
        action=f"inventory.{movement_type}",
        target_type="Product",
        target_id=product.id,
        ip_address=ip_address,
        metadata={
            "movement_id": movement.id,
            "sku": product.sku,
            "movement_type": movement_type,
            "quantity_delta": str(delta),
            "balance_before": str(balance_before),
            "balance_after": str(balance_after),
            "unit_cost": str(effective_unit_cost),
            "reference_type": clean_ref_type,
            "reference_code": clean_ref_code,
        },
    )
    return movement


def record_opening_stock(
    *,
    actor,
    product: Product,
    quantity: Decimal,
    unit_cost: Decimal | None = None,
    reference_code: str = "",
    notes: str = "",
    ip_address: str | None = None,
) -> StockMovement:
    return record_stock_movement(
        actor=actor,
        product=product,
        movement_type=StockMovement.MovementType.OPENING,
        quantity=quantity,
        unit_cost=unit_cost,
        reference_type="OPENING",
        reference_code=reference_code,
        notes=notes or "Opening stock entry",
        ip_address=ip_address,
    )


def record_stock_in(
    *,
    actor,
    product: Product,
    quantity: Decimal,
    unit_cost: Decimal | None = None,
    reference_type: str = "STOCK_IN",
    reference_code: str = "",
    notes: str = "",
    ip_address: str | None = None,
) -> StockMovement:
    return record_stock_movement(
        actor=actor,
        product=product,
        movement_type=StockMovement.MovementType.STOCK_IN,
        quantity=quantity,
        unit_cost=unit_cost,
        reference_type=reference_type,
        reference_code=reference_code,
        notes=notes,
        ip_address=ip_address,
    )


def record_stock_out(
    *,
    actor,
    product: Product,
    quantity: Decimal,
    reference_type: str = "STOCK_OUT",
    reference_code: str = "",
    notes: str = "",
    ip_address: str | None = None,
) -> StockMovement:
    return record_stock_movement(
        actor=actor,
        product=product,
        movement_type=StockMovement.MovementType.STOCK_OUT,
        quantity=quantity,
        reference_type=reference_type,
        reference_code=reference_code,
        notes=notes,
        ip_address=ip_address,
    )


def record_stock_adjustment(
    *,
    actor,
    product: Product,
    direction: str,
    quantity: Decimal,
    unit_cost: Decimal | None = None,
    reference_code: str = "",
    notes: str = "",
    ip_address: str | None = None,
) -> StockMovement:
    return record_stock_movement(
        actor=actor,
        product=product,
        movement_type=StockMovement.MovementType.ADJUSTMENT,
        quantity=quantity,
        direction=direction,
        unit_cost=unit_cost,
        reference_type="ADJUSTMENT",
        reference_code=reference_code,
        notes=notes,
        ip_address=ip_address,
    )


def get_inventory_valuation_report(*, category_id: int | None = None) -> dict[str, Any]:
    """Build real-time inventory valuation and stock health summary using exact Decimal math."""
    products_qs = Product.objects.select_related("category", "unit", "stock_balance").filter(
        track_inventory=True,
        is_active=True,
    )
    if category_id is not None:
        products_qs = products_qs.filter(category_id=category_id)

    total_tracked = 0
    total_units = Decimal("0.000")
    total_valuation = Decimal("0.00")
    total_retail_value = Decimal("0.00")
    low_stock_count = 0
    out_of_stock_count = 0
    by_category: dict[int, dict[str, Any]] = {}

    for prod in products_qs:
        total_tracked += 1
        bal = getattr(prod, "stock_balance", None)
        qty = bal.quantity_on_hand if bal else Decimal("0.000")
        avg_cost = bal.average_unit_cost if bal else prod.purchase_cost
        stock_val = (qty * avg_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        retail_val = (qty * prod.selling_price).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

        total_units += qty
        total_valuation += stock_val
        total_retail_value += retail_val

        if qty <= Decimal("0.000"):
            out_of_stock_count += 1
            if prod.min_stock_threshold >= Decimal("0.000"):
                low_stock_count += 1
        elif qty <= prod.min_stock_threshold:
            low_stock_count += 1

        cat_entry = by_category.setdefault(
            prod.category_id,
            {
                "category_id": prod.category_id,
                "category_name": prod.category.name,
                "category_name_km": prod.category.name_km,
                "product_count": 0,
                "total_quantity": Decimal("0.000"),
                "stock_valuation": Decimal("0.00"),
                "retail_valuation": Decimal("0.00"),
            },
        )
        cat_entry["product_count"] += 1
        cat_entry["total_quantity"] += qty
        cat_entry["stock_valuation"] += stock_val
        cat_entry["retail_valuation"] += retail_val

    movement_summary_qs = StockMovement.objects.all()
    if category_id is not None:
        movement_summary_qs = movement_summary_qs.filter(product__category_id=category_id)

    movements_by_type = [
        {
            "movement_type": row["movement_type"],
            "count": row["count"],
            "total_quantity": str(row["total_quantity"]),
        }
        for row in movement_summary_qs.values("movement_type")
        .annotate(
            count=Count("id"),
            total_quantity=Coalesce(
                Sum("quantity"),
                Value(Decimal("0.000"), output_field=DecimalField(max_digits=14, decimal_places=3)),
            ),
        )
        .order_by("movement_type")
    ]

    category_breakdown = [
        {
            "category_id": item["category_id"],
            "category_name": item["category_name"],
            "category_name_km": item["category_name_km"],
            "product_count": item["product_count"],
            "total_quantity": str(item["total_quantity"].quantize(QTY_QUANT)),
            "stock_valuation": str(item["stock_valuation"].quantize(MONEY_QUANT)),
            "retail_valuation": str(item["retail_valuation"].quantize(MONEY_QUANT)),
        }
        for item in sorted(by_category.values(), key=lambda c: c["category_name"])
    ]

    return {
        "valuation_method": "weighted_average_cost",
        "allow_negative_stock": getattr(settings, "INVENTORY_ALLOW_NEGATIVE_STOCK", False),
        "summary": {
            "total_tracked_products": total_tracked,
            "total_quantity_on_hand": str(total_units.quantize(QTY_QUANT)),
            "total_stock_valuation": str(total_valuation.quantize(MONEY_QUANT)),
            "total_retail_valuation": str(total_retail_value.quantize(MONEY_QUANT)),
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count,
        },
        "by_category": category_breakdown,
        "movements_by_type": movements_by_type,
    }
