"""Transactional POS checkout, cancellation, refund, and customer business services."""

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from apps.audit.services import log_audit_event
from apps.catalog.models import Product
from apps.inventory.models import StockMovement
from apps.inventory.services import record_stock_movement
from apps.sales.models import Customer, Sale, SaleItem, SalePayment

QTY_QUANT = Decimal("0.001")
MONEY_QUANT = Decimal("0.01")
VALID_TENDER_METHODS = {
    Sale.PaymentMethod.CASH,
    Sale.PaymentMethod.CARD,
    Sale.PaymentMethod.QR,
}


class SaleStateError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Operation is not allowed for the current sale status."
    default_code = "invalid_sale_state"


def _quantize_qty(value: Decimal) -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({"items": ["Enter a valid decimal quantity."]})
    return value.quantize(QTY_QUANT, rounding=ROUND_HALF_UP)


def _quantize_money(value: Decimal, field: str = "amount") -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({field: ["Enter a valid decimal monetary amount."]})
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _generate_sale_number() -> str:
    today = timezone.localdate().strftime("%Y%m%d")
    prefix = f"INV-{today}-"
    last = (
        Sale.objects.filter(sale_number__startswith=prefix)
        .order_by("-sale_number")
        .values_list("sale_number", flat=True)
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(last.rsplit("-", 1)[-1]) + 1
        except (TypeError, ValueError):
            seq = Sale.objects.filter(sale_number__startswith=prefix).count() + 1
    return f"{prefix}{seq:04d}"


@transaction.atomic
def create_customer(
    *,
    actor,
    name: str,
    phone: str = "",
    email: str = "",
    address: str = "",
    notes: str = "",
    is_active: bool = True,
    ip_address: str | None = None,
) -> Customer:
    clean_name = name.strip()
    if not clean_name:
        raise ValidationError({"name": ["Customer name cannot be blank."]})

    customer = Customer.objects.create(
        name=clean_name,
        phone=(phone or "").strip(),
        email=(email or "").strip(),
        address=(address or "").strip(),
        notes=(notes or "").strip(),
        is_active=is_active,
        created_by=actor,
    )
    log_audit_event(
        actor=actor,
        action="customer.created",
        target_type="Customer",
        target_id=customer.id,
        ip_address=ip_address,
        metadata={"name": customer.name, "phone": customer.phone},
    )
    return customer


@transaction.atomic
def update_customer(
    *,
    actor,
    customer: Customer,
    name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    address: str | None = None,
    notes: str | None = None,
    is_active: bool | None = None,
    ip_address: str | None = None,
) -> Customer:
    changed_fields: list[str] = []

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise ValidationError({"name": ["Customer name cannot be blank."]})
        if clean_name != customer.name:
            customer.name = clean_name
            changed_fields.append("name")

    if phone is not None:
        clean_phone = phone.strip()
        if clean_phone != customer.phone:
            customer.phone = clean_phone
            changed_fields.append("phone")

    if email is not None:
        clean_email = email.strip()
        if clean_email != customer.email:
            customer.email = clean_email
            changed_fields.append("email")

    if address is not None:
        clean_address = address.strip()
        if clean_address != customer.address:
            customer.address = clean_address
            changed_fields.append("address")

    if notes is not None:
        clean_notes = notes.strip()
        if clean_notes != customer.notes:
            customer.notes = clean_notes
            changed_fields.append("notes")

    if is_active is not None and is_active != customer.is_active:
        customer.is_active = is_active
        changed_fields.append("is_active")

    if changed_fields:
        customer.save(update_fields=[*changed_fields, "updated_at"])
        log_audit_event(
            actor=actor,
            action="customer.updated",
            target_type="Customer",
            target_id=customer.id,
            ip_address=ip_address,
            metadata={"changed_fields": changed_fields, "name": customer.name},
        )
    return customer


def _prepare_sale_lines(
    items: list[dict[str, Any]],
    discount_amount: Decimal,
    order_tax_rate: Decimal | None,
) -> tuple[list[dict[str, Any]], Decimal, Decimal, Decimal, Decimal]:
    if not items:
        raise ValidationError({"items": ["At least one product item is required for checkout."]})

    seen_product_ids: set[int] = set()
    product_ids: list[int] = []
    for idx, entry in enumerate(items):
        product = entry.get("product")
        if product is None:
            raise ValidationError({"items": [f"Row {idx + 1}: product is required."]})
        if product.id in seen_product_ids:
            raise ValidationError(
                {"items": [f"Duplicate product '{product.sku}' is not allowed in the same sale."]}
            )
        seen_product_ids.add(product.id)
        product_ids.append(product.id)

    products_by_id = {
        p.id: p
        for p in Product.objects.select_related("unit", "stock_balance").filter(id__in=product_ids)
    }

    raw_lines: list[dict[str, Any]] = []
    subtotal = Decimal("0.00")

    for idx, entry in enumerate(items):
        prod = products_by_id.get(entry["product"].id)
        if prod is None:
            raise ValidationError({"items": [f"Row {idx + 1}: product does not exist."]})
        if not prod.is_active:
            raise ValidationError(
                {"items": [f"Row {idx + 1}: product '{prod.sku}' is inactive and cannot be sold."]}
            )

        qty = _quantize_qty(entry["quantity"])
        if qty <= Decimal("0.000"):
            raise ValidationError({"items": [f"Row {idx + 1}: quantity must be greater than zero."]})
        if not prod.unit.allow_decimal and qty != qty.to_integral_value():
            raise ValidationError(
                {
                    "items": [
                        f"Row {idx + 1}: unit '{prod.unit.abbreviation}' does not allow decimal quantities."
                    ]
                }
            )

        # Authoritative server-side selling price (never trust client price).
        unit_price = _quantize_money(prod.selling_price, "unit_price")
        line_subtotal = (qty * unit_price).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        subtotal += line_subtotal

        effective_tax_rate = (
            prod.tax_rate
            if prod.tax_rate > Decimal("0.00")
            else (order_tax_rate if order_tax_rate is not None else Decimal("0.00"))
        )

        raw_lines.append(
            {
                "product": prod,
                "quantity": qty,
                "unit_price": unit_price,
                "tax_rate": effective_tax_rate,
                "line_subtotal": line_subtotal,
            }
        )

    subtotal = subtotal.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    clean_discount = _quantize_money(discount_amount, "discount_amount")
    if clean_discount < Decimal("0.00"):
        raise ValidationError({"discount_amount": ["Discount cannot be negative."]})
    if clean_discount > subtotal:
        raise ValidationError({"discount_amount": ["Discount cannot exceed sale subtotal."]})

    # Allocate order-level discount proportionally across lines before calculating tax.
    tax_total = Decimal("0.00")
    remaining_discount = clean_discount
    prepared_lines: list[dict[str, Any]] = []

    for idx, line in enumerate(raw_lines):
        if subtotal > Decimal("0.00") and clean_discount > Decimal("0.00"):
            if idx == len(raw_lines) - 1:
                allocated_discount = remaining_discount
            else:
                allocated_discount = (
                    (clean_discount * line["line_subtotal"]) / subtotal
                ).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
                allocated_discount = min(allocated_discount, remaining_discount, line["line_subtotal"])
                remaining_discount -= allocated_discount
        else:
            allocated_discount = Decimal("0.00")

        taxable_base = max(Decimal("0.00"), line["line_subtotal"] - allocated_discount)
        line_tax = (
            (taxable_base * line["tax_rate"]) / Decimal("100.00")
        ).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        line_total = (line["line_subtotal"] - allocated_discount + line_tax).quantize(
            MONEY_QUANT, rounding=ROUND_HALF_UP
        )
        tax_total += line_tax

        prepared_lines.append(
            {
                **line,
                "line_tax": line_tax,
                "line_total": line_total,
            }
        )

    tax_total = tax_total.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    grand_total = (subtotal - clean_discount + tax_total).quantize(
        MONEY_QUANT, rounding=ROUND_HALF_UP
    )
    return prepared_lines, subtotal, clean_discount, tax_total, grand_total


def _normalize_payments(
    *,
    total_amount: Decimal,
    payments: list[dict[str, Any]] | None,
    payment_method: str | None,
    paid_amount: Decimal | None,
    payment_reference: str = "",
) -> tuple[list[dict[str, Any]], str, Decimal, Decimal]:
    normalized: list[dict[str, Any]] = []

    if payments:
        for idx, entry in enumerate(payments):
            method = entry.get("payment_method")
            if method not in VALID_TENDER_METHODS:
                raise ValidationError(
                    {"payments": [f"Payment {idx + 1}: unsupported payment method."]}
                )
            amt = _quantize_money(entry.get("amount"), "payments")
            if amt <= Decimal("0.00"):
                raise ValidationError(
                    {"payments": [f"Payment {idx + 1}: amount must be greater than zero."]}
                )
            normalized.append(
                {
                    "payment_method": method,
                    "amount": amt,
                    "reference_code": (entry.get("reference_code") or "").strip(),
                }
            )
    else:
        method = payment_method or Sale.PaymentMethod.CASH
        if method not in VALID_TENDER_METHODS:
            raise ValidationError({"payment_method": ["Unsupported payment method."]})
        tendered = (
            _quantize_money(paid_amount, "paid_amount")
            if paid_amount is not None
            else total_amount
        )
        if total_amount > Decimal("0.00"):
            if tendered <= Decimal("0.00"):
                raise ValidationError({"paid_amount": ["Paid amount must be greater than zero."]})
            normalized.append(
                {
                    "payment_method": method,
                    "amount": tendered,
                    "reference_code": (payment_reference or "").strip(),
                }
            )
        elif tendered > Decimal("0.00"):
            normalized.append(
                {
                    "payment_method": method,
                    "amount": tendered,
                    "reference_code": (payment_reference or "").strip(),
                }
            )

    total_paid = sum((p["amount"] for p in normalized), Decimal("0.00")).quantize(
        MONEY_QUANT, rounding=ROUND_HALF_UP
    )

    if total_paid < total_amount:
        raise ValidationError(
            {
                "paid_amount": [
                    f"Paid amount ({total_paid}) is less than the grand total ({total_amount})."
                ]
            }
        )

    methods_used = {p["payment_method"] for p in normalized}
    has_cash = Sale.PaymentMethod.CASH in methods_used
    if not has_cash and total_paid > total_amount:
        raise ValidationError(
            {
                "paid_amount": [
                    "Overpayment with change is only permitted when Cash is included."
                ]
            }
        )

    change_amount = (total_paid - total_amount).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

    if len(methods_used) == 0:
        header_method = payment_method or Sale.PaymentMethod.CASH
    elif len(methods_used) == 1:
        header_method = next(iter(methods_used))
    else:
        header_method = Sale.PaymentMethod.SPLIT

    return normalized, header_method, total_paid, change_amount


def checkout_sale(
    *,
    actor,
    items: list[dict[str, Any]],
    customer: Customer | None = None,
    discount_amount: Decimal = Decimal("0.00"),
    order_tax_rate: Decimal | None = None,
    payments: list[dict[str, Any]] | None = None,
    payment_method: str | None = None,
    paid_amount: Decimal | None = None,
    payment_reference: str = "",
    notes: str = "",
    idempotency_key: str | None = None,
    ip_address: str | None = None,
) -> tuple[Sale, bool]:
    """
    Atomically complete a POS sale:
    - Recomputes all prices, discounts, tax, totals, and change server-side in Decimal.
    - Enforces `sales.discount` server-side when discount_amount > 0.
    - Supports idempotent retries via `idempotency_key`.
    - Deducts stock exclusively through `apps.inventory.services.record_stock_movement`.
    - Rolls back everything if any item fails validation or lacks sufficient stock.

    Returns `(sale, created)` where `created` is False on idempotent replay.
    """
    clean_idem_key = (idempotency_key or "").strip() or None

    if clean_idem_key:
        existing = Sale.objects.filter(idempotency_key=clean_idem_key).first()
        if existing is not None:
            return existing, False

    if customer is not None and not customer.is_active:
        raise ValidationError({"customer": ["Selected customer is inactive."]})

    clean_discount_check = _quantize_money(discount_amount, "discount_amount")
    if clean_discount_check > Decimal("0.00") and not (
        getattr(actor, "is_super_admin_user", False) or actor.has_rbac_permission("sales.discount")
    ):
        raise PermissionDenied("You do not have permission to apply discounts to sales.")

    if order_tax_rate is not None:
        if order_tax_rate < Decimal("0.00") or order_tax_rate > Decimal("100.00"):
            raise ValidationError({"tax_rate": ["Tax rate must be between 0 and 100."]})

    prepared_lines, subtotal, clean_discount, tax_total, grand_total = _prepare_sale_lines(
        items=items,
        discount_amount=discount_amount,
        order_tax_rate=order_tax_rate,
    )

    normalized_payments, header_method, total_paid, change_amount = _normalize_payments(
        total_amount=grand_total,
        payments=payments,
        payment_method=payment_method,
        paid_amount=paid_amount,
        payment_reference=payment_reference,
    )

    try:
        with transaction.atomic():
            if clean_idem_key:
                existing = (
                    Sale.objects.select_for_update()
                    .filter(idempotency_key=clean_idem_key)
                    .first()
                )
                if existing is not None:
                    return existing, False

            sale = Sale.objects.create(
                sale_number=_generate_sale_number(),
                idempotency_key=clean_idem_key,
                customer=customer,
                customer_name_snapshot=customer.name if customer else "Walk-in Customer",
                status=Sale.Status.COMPLETED,
                subtotal=subtotal,
                discount_amount=clean_discount,
                tax_amount=tax_total,
                total_amount=grand_total,
                paid_amount=total_paid,
                change_amount=change_amount,
                payment_method=header_method,
                notes=(notes or "").strip(),
                cashier=actor,
            )

            for line in prepared_lines:
                prod: Product = line["product"]
                if prod.track_inventory:
                    movement = record_stock_movement(
                        actor=actor,
                        product=prod,
                        movement_type=StockMovement.MovementType.SALE,
                        quantity=line["quantity"],
                        reference_type="SALE",
                        reference_code=sale.sale_number,
                        notes=f"POS Sale {sale.sale_number}",
                        ip_address=ip_address,
                    )
                    cost_snapshot = movement.unit_cost
                else:
                    cost_snapshot = prod.purchase_cost

                SaleItem.objects.create(
                    sale=sale,
                    product=prod,
                    product_sku_snapshot=prod.sku,
                    product_name_snapshot=prod.name,
                    unit_abbreviation_snapshot=prod.unit.abbreviation,
                    quantity=line["quantity"],
                    unit_price=line["unit_price"],
                    unit_cost_snapshot=cost_snapshot,
                    tax_rate_snapshot=line["tax_rate"],
                    line_subtotal=line["line_subtotal"],
                    line_tax=line["line_tax"],
                    line_total=line["line_total"],
                )

            if normalized_payments:
                SalePayment.objects.bulk_create(
                    [
                        SalePayment(
                            sale=sale,
                            payment_method=p["payment_method"],
                            amount=p["amount"],
                            reference_code=p["reference_code"],
                        )
                        for p in normalized_payments
                    ]
                )

            log_audit_event(
                actor=actor,
                action="sale.completed",
                target_type="Sale",
                target_id=sale.id,
                ip_address=ip_address,
                metadata={
                    "sale_number": sale.sale_number,
                    "customer_id": sale.customer_id,
                    "subtotal": str(sale.subtotal),
                    "discount_amount": str(sale.discount_amount),
                    "tax_amount": str(sale.tax_amount),
                    "total_amount": str(sale.total_amount),
                    "payment_method": sale.payment_method,
                    "items_count": len(prepared_lines),
                },
            )
            if clean_discount > Decimal("0.00"):
                log_audit_event(
                    actor=actor,
                    action="sale.discount_applied",
                    target_type="Sale",
                    target_id=sale.id,
                    ip_address=ip_address,
                    metadata={
                        "sale_number": sale.sale_number,
                        "discount_amount": str(clean_discount),
                        "subtotal": str(subtotal),
                        "total_amount": str(grand_total),
                    },
                )
            return sale, True
    except IntegrityError:
        if clean_idem_key:
            existing = Sale.objects.filter(idempotency_key=clean_idem_key).first()
            if existing is not None:
                return existing, False
        raise


@transaction.atomic
def cancel_sale(
    *,
    actor,
    sale: Sale,
    reason: str,
    ip_address: str | None = None,
) -> Sale:
    """
    Atomically cancel (void) a completed sale and restore stock via the inventory service.
    Blocks duplicate cancellations or cancelling already-refunded sales (409 Conflict).
    """
    clean_reason = (reason or "").strip()
    if not clean_reason:
        raise ValidationError({"reason": ["A cancellation reason is required."]})

    locked = Sale.objects.select_for_update().get(pk=sale.pk)
    if locked.status == Sale.Status.CANCELLED:
        raise SaleStateError(f"Sale '{locked.sale_number}' has already been cancelled.")
    if locked.status == Sale.Status.REFUNDED:
        raise SaleStateError(
            f"Sale '{locked.sale_number}' has already been refunded and cannot be cancelled."
        )

    items = list(locked.items.select_related("product", "product__unit").all())
    for item in items:
        if item.product.track_inventory:
            record_stock_movement(
                actor=actor,
                product=item.product,
                movement_type=StockMovement.MovementType.VOID,
                quantity=item.quantity,
                unit_cost=item.unit_cost_snapshot,
                reference_type="SALE_CANCEL",
                reference_code=locked.sale_number,
                notes=f"Cancelled sale {locked.sale_number}: {clean_reason}",
                ip_address=ip_address,
            )

    locked.status = Sale.Status.CANCELLED
    locked.cancelled_by = actor
    locked.cancelled_at = timezone.now()
    locked.cancel_reason = clean_reason
    locked.save(
        update_fields=["status", "cancelled_by", "cancelled_at", "cancel_reason", "updated_at"]
    )

    log_audit_event(
        actor=actor,
        action="sale.cancelled",
        target_type="Sale",
        target_id=locked.id,
        ip_address=ip_address,
        metadata={
            "sale_number": locked.sale_number,
            "total_amount": str(locked.total_amount),
            "reason": clean_reason,
            "items_restored": len(items),
        },
    )
    return locked


@transaction.atomic
def refund_sale(
    *,
    actor,
    sale: Sale,
    reason: str,
    ip_address: str | None = None,
) -> Sale:
    """
    Atomically refund a completed sale and restore stock via the inventory service.
    Blocks duplicate refunds or refunding already-cancelled sales (409 Conflict).
    """
    clean_reason = (reason or "").strip()
    if not clean_reason:
        raise ValidationError({"reason": ["A refund reason is required."]})

    locked = Sale.objects.select_for_update().get(pk=sale.pk)
    if locked.status == Sale.Status.REFUNDED:
        raise SaleStateError(f"Sale '{locked.sale_number}' has already been refunded.")
    if locked.status == Sale.Status.CANCELLED:
        raise SaleStateError(
            f"Sale '{locked.sale_number}' has already been cancelled and cannot be refunded."
        )

    items = list(locked.items.select_related("product", "product__unit").all())
    for item in items:
        if item.product.track_inventory:
            record_stock_movement(
                actor=actor,
                product=item.product,
                movement_type=StockMovement.MovementType.REFUND,
                quantity=item.quantity,
                unit_cost=item.unit_cost_snapshot,
                reference_type="SALE_REFUND",
                reference_code=locked.sale_number,
                notes=f"Refunded sale {locked.sale_number}: {clean_reason}",
                ip_address=ip_address,
            )

    locked.status = Sale.Status.REFUNDED
    locked.refunded_by = actor
    locked.refunded_at = timezone.now()
    locked.refund_reason = clean_reason
    locked.save(
        update_fields=["status", "refunded_by", "refunded_at", "refund_reason", "updated_at"]
    )

    log_audit_event(
        actor=actor,
        action="sale.refunded",
        target_type="Sale",
        target_id=locked.id,
        ip_address=ip_address,
        metadata={
            "sale_number": locked.sale_number,
            "total_amount": str(locked.total_amount),
            "reason": clean_reason,
            "items_restored": len(items),
        },
    )
    return locked
