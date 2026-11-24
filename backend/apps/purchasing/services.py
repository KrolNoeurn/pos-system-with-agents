"""Purchasing & Goods Receiving business services with atomic inventory integration."""

import csv
from decimal import Decimal, ROUND_HALF_UP
import io
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.audit.services import log_audit_event
from apps.catalog.models import Product
from apps.inventory.models import StockMovement
from apps.inventory.services import record_stock_movement
from apps.purchasing.models import Purchase, PurchaseItem, Supplier

MONEY_QUANT = Decimal("0.01")
QTY_QUANT = Decimal("0.001")


class PurchaseStateError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This purchase cannot be modified in its current status."
    default_code = "purchase_invalid_state"


def _quantize_money(value: Decimal, field: str) -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({field: ["Enter a valid monetary decimal amount."]})
    if value < Decimal("0.00"):
        raise ValidationError({field: ["Monetary amount cannot be negative."]})
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _quantize_qty(value: Decimal) -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({"items": ["Enter a valid decimal quantity."]})
    if value <= Decimal("0.000"):
        raise ValidationError({"items": ["Item quantity must be greater than zero."]})
    return value.quantize(QTY_QUANT, rounding=ROUND_HALF_UP)


def _generate_purchase_number() -> str:
    today = timezone.localdate().strftime("%Y%m%d")
    prefix = f"PO-{today}-"
    last = (
        Purchase.objects.filter(purchase_number__startswith=prefix)
        .order_by("-purchase_number")
        .values_list("purchase_number", flat=True)
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(last.rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = 1
    return f"{prefix}{seq:04d}"


def _prepare_purchase_lines(items_data: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], Decimal]:
    if not items_data:
        raise ValidationError({"items": ["At least one purchase item is required."]})

    seen_products: set[int] = set()
    product_ids = [item["product"].pk if isinstance(item["product"], Product) else item["product"] for item in items_data]
    products_map = {
        p.pk: p
        for p in Product.objects.select_related("unit").filter(pk__in=product_ids)
    }

    prepared: list[dict[str, Any]] = []
    subtotal = Decimal("0.00")

    for idx, raw in enumerate(items_data):
        prod_ref = raw["product"]
        prod_id = prod_ref.pk if isinstance(prod_ref, Product) else prod_ref
        product = products_map.get(prod_id)
        if product is None:
            raise ValidationError({"items": [f"Line {idx + 1}: product does not exist."]})
        if not product.is_active:
            raise ValidationError({"items": [f"Line {idx + 1}: product '{product.sku}' is inactive."]})
        if prod_id in seen_products:
            raise ValidationError(
                {"items": [f"Duplicate product '{product.sku}' in purchase items; combine quantities on one line."]}
            )
        seen_products.add(prod_id)

        qty = _quantize_qty(raw["quantity"])
        if not product.unit.allow_decimal and qty != qty.to_integral_value():
            raise ValidationError(
                {
                    "items": [
                        f"Line {idx + 1}: unit '{product.unit.abbreviation}' for '{product.sku}' does not allow decimal quantities."
                    ]
                }
            )

        unit_cost = _quantize_money(raw["unit_cost"], "unit_cost")
        line_total = (qty * unit_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        subtotal += line_total

        prepared.append(
            {
                "product": product,
                "product_sku_snapshot": product.sku,
                "product_name_snapshot": product.name,
                "unit_abbreviation_snapshot": product.unit.abbreviation,
                "quantity": qty,
                "unit_cost": unit_cost,
                "line_total": line_total,
            }
        )

    return prepared, subtotal.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Supplier Services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_supplier(
    *,
    actor,
    name: str,
    contact_name: str = "",
    phone: str = "",
    email: str = "",
    address: str = "",
    is_active: bool = True,
    ip_address: str | None = None,
) -> Supplier:
    clean_name = name.strip()
    if not clean_name:
        raise ValidationError({"name": ["Supplier name cannot be blank."]})
    if Supplier.objects.filter(name__iexact=clean_name).exists():
        raise ValidationError({"name": ["A supplier with this name already exists."]})

    supplier = Supplier.objects.create(
        name=clean_name,
        contact_name=(contact_name or "").strip(),
        phone=(phone or "").strip(),
        email=(email or "").strip().lower(),
        address=(address or "").strip(),
        is_active=is_active,
    )
    log_audit_event(
        actor=actor,
        action="supplier.created",
        target_type="Supplier",
        target_id=supplier.id,
        ip_address=ip_address,
        metadata={"name": supplier.name},
    )
    return supplier


@transaction.atomic
def update_supplier(
    *,
    actor,
    supplier: Supplier,
    name: str | None = None,
    contact_name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    address: str | None = None,
    is_active: bool | None = None,
    ip_address: str | None = None,
) -> Supplier:
    updated_fields: list[str] = []
    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise ValidationError({"name": ["Supplier name cannot be blank."]})
        if Supplier.objects.filter(name__iexact=clean_name).exclude(pk=supplier.pk).exists():
            raise ValidationError({"name": ["A supplier with this name already exists."]})
        if clean_name != supplier.name:
            supplier.name = clean_name
            updated_fields.append("name")

    for field_name, val in (
        ("contact_name", contact_name.strip() if contact_name is not None else None),
        ("phone", phone.strip() if phone is not None else None),
        ("email", email.strip().lower() if email is not None else None),
        ("address", address.strip() if address is not None else None),
        ("is_active", is_active),
    ):
        if val is not None and getattr(supplier, field_name) != val:
            setattr(supplier, field_name, val)
            updated_fields.append(field_name)

    if updated_fields:
        supplier.save(update_fields=[*updated_fields, "updated_at"])
        log_audit_event(
            actor=actor,
            action="supplier.updated",
            target_type="Supplier",
            target_id=supplier.id,
            ip_address=ip_address,
            metadata={"name": supplier.name, "updated_fields": updated_fields},
        )
    return supplier


def _parse_bool_cell(raw: str | None, default: bool = True) -> bool:
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "active", "y"}


@transaction.atomic
def import_suppliers_csv(
    *,
    actor,
    csv_text: str,
    ip_address: str | None = None,
) -> dict[str, Any]:
    """
    Atomically import or update Suppliers from CSV text.
    Expected columns: name (required), contact_name, phone, email, address, is_active.
    """
    clean_text = (csv_text or "").lstrip("\ufeff").strip()
    if not clean_text:
        raise ValidationError({"file": ["CSV content cannot be empty."]})

    reader = csv.DictReader(io.StringIO(clean_text))
    if not reader.fieldnames:
        raise ValidationError({"file": ["CSV header row is required (must include 'name')."]})

    headers = {h.strip().lower() for h in reader.fieldnames if h}
    if "name" not in headers:
        raise ValidationError({"file": ["CSV must include a 'name' column."]})

    rows = list(reader)
    if not rows:
        raise ValidationError({"file": ["CSV contains no data rows."]})

    created_count = 0
    updated_count = 0
    row_errors: list[str] = []

    for idx, raw_row in enumerate(rows, start=2):
        norm = {(k or "").strip().lower(): (v or "").strip() for k, v in raw_row.items()}
        name = norm.get("name", "")
        contact_name = norm.get("contact_name", "")
        phone = norm.get("phone", "")
        email = norm.get("email", "")
        address = norm.get("address", "")
        is_active = _parse_bool_cell(norm.get("is_active"), default=True)

        if not name:
            row_errors.append(f"Row {idx}: supplier name is required.")
            continue
        if email and "@" not in email:
            row_errors.append(f"Row {idx}: invalid email '{email}'.")
            continue

        existing = Supplier.objects.filter(name__iexact=name).first()
        if existing is not None:
            update_supplier(
                actor=actor,
                supplier=existing,
                contact_name=contact_name or existing.contact_name,
                phone=phone or existing.phone,
                email=email or existing.email,
                address=address or existing.address,
                is_active=is_active,
                ip_address=ip_address,
            )
            updated_count += 1
        else:
            create_supplier(
                actor=actor,
                name=name,
                contact_name=contact_name,
                phone=phone,
                email=email,
                address=address,
                is_active=is_active,
                ip_address=ip_address,
            )
            created_count += 1

    if row_errors:
        raise ValidationError({"rows": row_errors})

    log_audit_event(
        actor=actor,
        action="supplier.imported",
        target_type="Supplier",
        target_id="bulk",
        ip_address=ip_address,
        metadata={"created_count": created_count, "updated_count": updated_count},
    )
    return {
        "created_count": created_count,
        "updated_count": updated_count,
        "total_processed": created_count + updated_count,
    }


# ---------------------------------------------------------------------------
# Purchase & Goods Receiving Services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_purchase(
    *,
    actor,
    supplier: Supplier,
    items: list[dict[str, Any]],
    discount_amount: Decimal = Decimal("0.00"),
    purchase_date=None,
    expected_date=None,
    notes: str = "",
    initial_status: str = Purchase.Status.DRAFT,
    ip_address: str | None = None,
) -> Purchase:
    """
    Create a Draft or Ordered purchase order.

    IMPORTANT: Creating a purchase NEVER increases inventory; stock is updated
    exclusively when `receive_purchase()` is executed.
    """
    if not supplier.is_active:
        raise ValidationError({"supplier": ["Selected supplier is inactive."]})

    if initial_status not in (Purchase.Status.DRAFT, Purchase.Status.ORDERED):
        raise ValidationError(
            {"status": ["New purchases must start as 'draft' or 'ordered' before receiving."]}
        )

    prepared_lines, subtotal = _prepare_purchase_lines(items)
    clean_discount = _quantize_money(discount_amount, "discount_amount")
    if clean_discount > subtotal:
        raise ValidationError(
            {"discount_amount": ["Discount cannot exceed purchase subtotal."]}
        )

    total_amount = (subtotal - clean_discount).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

    purchase = Purchase.objects.create(
        purchase_number=_generate_purchase_number(),
        supplier=supplier,
        status=initial_status,
        purchase_date=purchase_date or timezone.localdate(),
        expected_date=expected_date,
        subtotal=subtotal,
        discount_amount=clean_discount,
        total_amount=total_amount,
        notes=(notes or "").strip(),
        created_by=actor,
    )

    PurchaseItem.objects.bulk_create(
        [PurchaseItem(purchase=purchase, **line) for line in prepared_lines]
    )

    log_audit_event(
        actor=actor,
        action="purchase.created",
        target_type="Purchase",
        target_id=purchase.id,
        ip_address=ip_address,
        metadata={
            "purchase_number": purchase.purchase_number,
            "supplier_id": supplier.id,
            "status": purchase.status,
            "item_count": len(prepared_lines),
            "subtotal": str(subtotal),
            "discount_amount": str(clean_discount),
            "total_amount": str(total_amount),
        },
    )
    return purchase


@transaction.atomic
def update_purchase(
    *,
    actor,
    purchase: Purchase,
    supplier: Supplier | None = None,
    items: list[dict[str, Any]] | None = None,
    discount_amount: Decimal | None = None,
    purchase_date=None,
    expected_date_provided: bool = False,
    expected_date=None,
    notes: str | None = None,
    new_status: str | None = None,
    ip_address: str | None = None,
) -> Purchase:
    locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
    if locked.status not in (Purchase.Status.DRAFT, Purchase.Status.ORDERED):
        raise PurchaseStateError(
            f"Purchase '{locked.purchase_number}' is '{locked.status}' and can no longer be edited."
        )

    updated_fields: list[str] = []

    if supplier is not None and supplier.pk != locked.supplier_id:
        if not supplier.is_active:
            raise ValidationError({"supplier": ["Selected supplier is inactive."]})
        locked.supplier = supplier
        updated_fields.append("supplier")

    if new_status is not None and new_status != locked.status:
        if new_status not in (Purchase.Status.DRAFT, Purchase.Status.ORDERED):
            raise ValidationError(
                {"status": ["Use dedicated receive or cancel endpoints for final status transitions."]}
            )
        locked.status = new_status
        updated_fields.append("status")

    if purchase_date is not None and purchase_date != locked.purchase_date:
        locked.purchase_date = purchase_date
        updated_fields.append("purchase_date")

    if expected_date_provided and expected_date != locked.expected_date:
        locked.expected_date = expected_date
        updated_fields.append("expected_date")

    if notes is not None:
        clean_notes = notes.strip()
        if clean_notes != locked.notes:
            locked.notes = clean_notes
            updated_fields.append("notes")

    subtotal = locked.subtotal
    if items is not None:
        prepared_lines, subtotal = _prepare_purchase_lines(items)
        locked.items.all().delete()
        PurchaseItem.objects.bulk_create(
            [PurchaseItem(purchase=locked, **line) for line in prepared_lines]
        )
        locked.subtotal = subtotal
        updated_fields.append("subtotal")

    clean_discount = (
        _quantize_money(discount_amount, "discount_amount")
        if discount_amount is not None
        else locked.discount_amount
    )
    if clean_discount > subtotal:
        raise ValidationError(
            {"discount_amount": ["Discount cannot exceed purchase subtotal."]}
        )

    if clean_discount != locked.discount_amount:
        locked.discount_amount = clean_discount
        updated_fields.append("discount_amount")

    new_total = (subtotal - clean_discount).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    if new_total != locked.total_amount:
        locked.total_amount = new_total
        updated_fields.append("total_amount")

    if updated_fields:
        locked.save(update_fields=[*updated_fields, "updated_at"])
        log_audit_event(
            actor=actor,
            action="purchase.updated",
            target_type="Purchase",
            target_id=locked.id,
            ip_address=ip_address,
            metadata={
                "purchase_number": locked.purchase_number,
                "updated_fields": updated_fields,
                "total_amount": str(locked.total_amount),
            },
        )
    return locked


@transaction.atomic
def receive_purchase(
    *,
    actor,
    purchase: Purchase,
    notes: str = "",
    ip_address: str | None = None,
) -> Purchase:
    """
    Atomically receive goods for a Draft/Ordered purchase and increase inventory
    exclusively through `apps.inventory.services.record_stock_movement`.
    """
    locked = (
        Purchase.objects.select_for_update()
        .select_related("supplier")
        .get(pk=purchase.pk)
    )

    if locked.status == Purchase.Status.RECEIVED:
        raise PurchaseStateError(
            f"Purchase '{locked.purchase_number}' has already been received."
        )
    if locked.status == Purchase.Status.CANCELLED:
        raise PurchaseStateError(
            f"Cannot receive cancelled purchase '{locked.purchase_number}'."
        )

    items = list(locked.items.select_related("product", "product__unit").all())
    if not items:
        raise ValidationError({"items": ["Cannot receive a purchase with no items."]})

    locked.status = Purchase.Status.RECEIVED
    locked.received_by = actor
    locked.received_at = timezone.now()
    if notes and notes.strip():
        locked.notes = (
            f"{locked.notes}\nReceiving note: {notes.strip()}".strip()
            if locked.notes
            else notes.strip()
        )
    locked.save(update_fields=["status", "received_by", "received_at", "notes", "updated_at"])

    movements_created = 0
    for item in items:
        if not item.product.track_inventory:
            continue
        record_stock_movement(
            actor=actor,
            product=item.product,
            movement_type=StockMovement.MovementType.PURCHASE,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            reference_type="PURCHASE",
            reference_code=locked.purchase_number,
            notes=f"Goods received from {locked.supplier.name} ({locked.purchase_number})",
            ip_address=ip_address,
        )
        movements_created += 1

    log_audit_event(
        actor=actor,
        action="purchase.received",
        target_type="Purchase",
        target_id=locked.id,
        ip_address=ip_address,
        metadata={
            "purchase_number": locked.purchase_number,
            "supplier": locked.supplier.name,
            "total_amount": str(locked.total_amount),
            "inventory_movements_created": movements_created,
        },
    )
    return locked


@transaction.atomic
def cancel_purchase(
    *,
    actor,
    purchase: Purchase,
    reason: str = "",
    ip_address: str | None = None,
) -> Purchase:
    """Cancel a Draft or Ordered purchase while preserving historical records."""
    locked = Purchase.objects.select_for_update().get(pk=purchase.pk)

    if locked.status == Purchase.Status.RECEIVED:
        raise PurchaseStateError(
            f"Purchase '{locked.purchase_number}' has already been received and cannot be cancelled."
        )
    if locked.status == Purchase.Status.CANCELLED:
        raise PurchaseStateError(
            f"Purchase '{locked.purchase_number}' is already cancelled."
        )

    clean_reason = (reason or "").strip()
    locked.status = Purchase.Status.CANCELLED
    locked.cancelled_by = actor
    locked.cancelled_at = timezone.now()
    locked.cancellation_reason = clean_reason
    locked.save(
        update_fields=["status", "cancelled_by", "cancelled_at", "cancellation_reason", "updated_at"]
    )

    log_audit_event(
        actor=actor,
        action="purchase.cancelled",
        target_type="Purchase",
        target_id=locked.id,
        ip_address=ip_address,
        metadata={
            "purchase_number": locked.purchase_number,
            "reason": clean_reason,
        },
    )
    return locked
