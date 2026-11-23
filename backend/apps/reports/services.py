"""Dashboard KPIs, Sales, Profit & Loss, Purchasing, and CSV Export services."""

import csv
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import io
from typing import Any

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import log_audit_event
from apps.catalog.models import Product
from apps.expenses.models import Expense
from apps.inventory.services import get_inventory_valuation_report
from apps.purchasing.models import Purchase
from apps.sales.models import Sale, SaleItem, SalePayment

MONEY_QUANT = Decimal("0.01")
QTY_QUANT = Decimal("0.001")
MONEY_FIELD = DecimalField(max_digits=14, decimal_places=2)
QTY_FIELD = DecimalField(max_digits=14, decimal_places=3)


def _q_money(val: Decimal | None) -> Decimal:
    return (val or Decimal("0.00")).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _q_qty(val: Decimal | None) -> Decimal:
    return (val or Decimal("0.000")).quantize(QTY_QUANT, rounding=ROUND_HALF_UP)


def _safe_csv_cell(value: Any) -> str:
    """Neutralize spreadsheet formula injection while keeping signed numbers intact."""
    text = "" if value is None else str(value)
    if not text:
        return ""
    if text[0] in ("=", "@", "\t", "\r"):
        return f"'{text}"
    if text[0] in ("+", "-"):
        try:
            Decimal(text)
        except Exception:
            return f"'{text}"
    return text


def get_dashboard_summary() -> dict[str, Any]:
    """Return real-time operational KPIs, recent receipts, and low-stock alerts."""
    today = timezone.localdate()
    month_start = today.replace(day=1)
    zero_money = Value(Decimal("0.00"), output_field=MONEY_FIELD)

    today_sales_agg = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        created_at__date=today,
    ).aggregate(
        total=Coalesce(Sum("total_amount"), zero_money),
        count=Count("id"),
    )
    today_total = _q_money(today_sales_agg["total"])
    today_count = today_sales_agg["count"]
    today_avg = (
        (today_total / Decimal(today_count)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        if today_count > 0
        else Decimal("0.00")
    )

    mtd_sales_agg = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        created_at__date__gte=month_start,
        created_at__date__lte=today,
    ).aggregate(
        total=Coalesce(Sum("total_amount"), zero_money),
        count=Count("id"),
    )
    mtd_expenses_agg = Expense.objects.filter(
        expense_date__gte=month_start,
        expense_date__lte=today,
    ).aggregate(
        total=Coalesce(Sum("amount"), zero_money),
        count=Count("id"),
    )

    pending_purchases_count = Purchase.objects.filter(
        status__in=[Purchase.Status.DRAFT, Purchase.Status.ORDERED]
    ).count()

    tracked_products = Product.objects.select_related("unit", "stock_balance").filter(
        track_inventory=True,
        is_active=True,
    )
    low_stock_rows: list[dict[str, Any]] = []
    low_stock_count = 0
    out_of_stock_count = 0
    tracked_count = 0

    for prod in tracked_products:
        tracked_count += 1
        bal = getattr(prod, "stock_balance", None)
        qty = bal.quantity_on_hand if bal else Decimal("0.000")
        if qty <= Decimal("0.000"):
            out_of_stock_count += 1
            if prod.min_stock_threshold >= Decimal("0.000"):
                low_stock_count += 1
                low_stock_rows.append(
                    {
                        "product_id": prod.id,
                        "sku": prod.sku,
                        "name": prod.name,
                        "name_km": prod.name_km,
                        "quantity_on_hand": str(_q_qty(qty)),
                        "min_stock_threshold": str(_q_qty(prod.min_stock_threshold)),
                        "unit_abbreviation": prod.unit.abbreviation,
                        "_sort_qty": qty,
                    }
                )
        elif qty <= prod.min_stock_threshold:
            low_stock_count += 1
            low_stock_rows.append(
                {
                    "product_id": prod.id,
                    "sku": prod.sku,
                    "name": prod.name,
                    "name_km": prod.name_km,
                    "quantity_on_hand": str(_q_qty(qty)),
                    "min_stock_threshold": str(_q_qty(prod.min_stock_threshold)),
                    "unit_abbreviation": prod.unit.abbreviation,
                    "_sort_qty": qty,
                }
            )

    low_stock_rows.sort(key=lambda r: (r["_sort_qty"], r["sku"]))
    top_low_stock = [
        {k: v for k, v in row.items() if k != "_sort_qty"} for row in low_stock_rows[:5]
    ]

    recent_sales = [
        {
            "id": s.id,
            "sale_number": s.sale_number,
            "customer_name_snapshot": s.customer_name_snapshot,
            "total_amount": str(_q_money(s.total_amount)),
            "payment_method": s.payment_method,
            "status": s.status,
            "cashier_username": s.cashier.username,
            "created_at": s.created_at.isoformat(),
        }
        for s in Sale.objects.select_related("cashier").order_by("-created_at", "-id")[:5]
    ]

    return {
        "as_of_date": str(today),
        "kpis": {
            "today_sales_total": str(today_total),
            "today_sales_count": today_count,
            "today_avg_ticket": str(today_avg),
            "mtd_sales_total": str(_q_money(mtd_sales_agg["total"])),
            "mtd_sales_count": mtd_sales_agg["count"],
            "mtd_expenses_total": str(_q_money(mtd_expenses_agg["total"])),
            "tracked_products_count": tracked_count,
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count,
            "pending_purchases_count": pending_purchases_count,
        },
        "recent_sales": recent_sales,
        "low_stock_items": top_low_stock,
    }


def get_sales_report(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    """Generate exact Decimal Sales performance report with daily, payment, and product rankings."""
    zero_money = Value(Decimal("0.00"), output_field=MONEY_FIELD)
    zero_qty = Value(Decimal("0.000"), output_field=QTY_FIELD)

    all_sales = Sale.objects.all()
    if date_from is not None:
        all_sales = all_sales.filter(created_at__date__gte=date_from)
    if date_to is not None:
        all_sales = all_sales.filter(created_at__date__lte=date_to)

    completed_sales = all_sales.filter(status=Sale.Status.COMPLETED)
    cancelled_count = all_sales.filter(status=Sale.Status.CANCELLED).count()
    refunded_count = all_sales.filter(status=Sale.Status.REFUNDED).count()

    agg = completed_sales.aggregate(
        count=Count("id"),
        gross_subtotal=Coalesce(Sum("subtotal"), zero_money),
        total_discount=Coalesce(Sum("discount_amount"), zero_money),
        total_tax=Coalesce(Sum("tax_amount"), zero_money),
        net_revenue=Coalesce(Sum("total_amount"), zero_money),
    )

    completed_count = agg["count"]
    net_revenue = _q_money(agg["net_revenue"])
    avg_order = (
        (net_revenue / Decimal(completed_count)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        if completed_count > 0
        else Decimal("0.00")
    )

    daily_rows = [
        {
            "date": str(row["day"]),
            "sales_count": row["sales_count"],
            "revenue": str(_q_money(row["revenue"])),
            "discounts": str(_q_money(row["discounts"])),
            "tax": str(_q_money(row["tax"])),
        }
        for row in completed_sales.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(
            sales_count=Count("id"),
            revenue=Coalesce(Sum("total_amount"), zero_money),
            discounts=Coalesce(Sum("discount_amount"), zero_money),
            tax=Coalesce(Sum("tax_amount"), zero_money),
        )
        .order_by("-day")
    ]

    payment_rows = [
        {
            "payment_method": row["payment_method"],
            "count": row["count"],
            "total_amount": str(_q_money(row["total_amount"])),
        }
        for row in SalePayment.objects.filter(sale__in=completed_sales)
        .values("payment_method")
        .annotate(
            count=Count("id"),
            total_amount=Coalesce(Sum("amount"), zero_money),
        )
        .order_by("-total_amount", "payment_method")
    ]

    cogs_expr = ExpressionWrapper(
        F("quantity") * F("unit_cost_snapshot"),
        output_field=MONEY_FIELD,
    )
    top_products_raw = (
        SaleItem.objects.filter(sale__in=completed_sales)
        .values(
            "product_id",
            "product_sku_snapshot",
            "product_name_snapshot",
            "unit_abbreviation_snapshot",
        )
        .annotate(
            quantity_sold=Coalesce(Sum("quantity"), zero_qty),
            revenue=Coalesce(Sum("line_subtotal"), zero_money),
            cogs=Coalesce(Sum(cogs_expr), zero_money),
        )
        .order_by("-revenue", "product_sku_snapshot")[:15]
    )

    top_products = []
    for row in top_products_raw:
        rev = _q_money(row["revenue"])
        cogs = _q_money(row["cogs"])
        top_products.append(
            {
                "product_id": row["product_id"],
                "sku": row["product_sku_snapshot"],
                "name": row["product_name_snapshot"],
                "unit": row["unit_abbreviation_snapshot"],
                "quantity_sold": str(_q_qty(row["quantity_sold"])),
                "revenue": str(rev),
                "cogs": str(cogs),
                "gross_profit": str(_q_money(rev - cogs)),
            }
        )

    return {
        "filters": {
            "date_from": str(date_from) if date_from else None,
            "date_to": str(date_to) if date_to else None,
        },
        "summary": {
            "completed_count": completed_count,
            "cancelled_count": cancelled_count,
            "refunded_count": refunded_count,
            "gross_subtotal": str(_q_money(agg["gross_subtotal"])),
            "total_discount": str(_q_money(agg["total_discount"])),
            "total_tax": str(_q_money(agg["total_tax"])),
            "net_revenue": str(net_revenue),
            "average_order_value": str(avg_order),
        },
        "daily_breakdown": daily_rows,
        "payment_breakdown": payment_rows,
        "top_products": top_products,
    }


def get_profit_and_loss_report(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    """Generate exact Decimal Profit & Loss report using captured SaleItem cost snapshots."""
    zero_money = Value(Decimal("0.00"), output_field=MONEY_FIELD)

    sales_qs = Sale.objects.filter(status=Sale.Status.COMPLETED)
    expenses_qs = Expense.objects.select_related("category").all()
    purchases_qs = Purchase.objects.filter(status=Purchase.Status.RECEIVED)

    if date_from is not None:
        sales_qs = sales_qs.filter(created_at__date__gte=date_from)
        expenses_qs = expenses_qs.filter(expense_date__gte=date_from)
        purchases_qs = purchases_qs.filter(received_at__date__gte=date_from)

    if date_to is not None:
        sales_qs = sales_qs.filter(created_at__date__lte=date_to)
        expenses_qs = expenses_qs.filter(expense_date__lte=date_to)
        purchases_qs = purchases_qs.filter(received_at__date__lte=date_to)

    sales_agg = sales_qs.aggregate(
        gross_sales=Coalesce(Sum("subtotal"), zero_money),
        discounts=Coalesce(Sum("discount_amount"), zero_money),
        tax_collected=Coalesce(Sum("tax_amount"), zero_money),
        total_collected=Coalesce(Sum("total_amount"), zero_money),
    )

    # Exact COGS across completed sale line items
    cogs = Decimal("0.00")
    for item in SaleItem.objects.filter(sale__in=sales_qs).only("quantity", "unit_cost_snapshot"):
        cogs += (item.quantity * item.unit_cost_snapshot).quantize(
            MONEY_QUANT, rounding=ROUND_HALF_UP
        )
    cogs = _q_money(cogs)

    expense_agg = expenses_qs.aggregate(total=Coalesce(Sum("amount"), zero_money))
    purchase_agg = purchases_qs.aggregate(total=Coalesce(Sum("total_amount"), zero_money))

    gross_sales = _q_money(sales_agg["gross_sales"])
    discounts = _q_money(sales_agg["discounts"])
    net_sales = _q_money(gross_sales - discounts)
    tax_collected = _q_money(sales_agg["tax_collected"])
    total_sales_collected = _q_money(sales_agg["total_collected"])
    gross_profit = _q_money(net_sales - cogs)
    operating_expenses = _q_money(expense_agg["total"])
    net_profit = _q_money(gross_profit - operating_expenses)

    if net_sales > Decimal("0.00"):
        gross_margin_pct = ((gross_profit * Decimal("100.00")) / net_sales).quantize(
            MONEY_QUANT, rounding=ROUND_HALF_UP
        )
        net_margin_pct = ((net_profit * Decimal("100.00")) / net_sales).quantize(
            MONEY_QUANT, rounding=ROUND_HALF_UP
        )
    else:
        gross_margin_pct = Decimal("0.00")
        net_margin_pct = Decimal("0.00")

    expense_breakdown = [
        {
            "category_id": row["category_id"],
            "category_name": row["category__name"],
            "category_name_km": row["category__name_km"],
            "count": row["count"],
            "total_amount": str(_q_money(row["total_amount"])),
        }
        for row in expenses_qs.values("category_id", "category__name", "category__name_km")
        .annotate(
            count=Count("id"),
            total_amount=Coalesce(Sum("amount"), zero_money),
        )
        .order_by("-total_amount", "category__name")
    ]

    return {
        "filters": {
            "date_from": str(date_from) if date_from else None,
            "date_to": str(date_to) if date_to else None,
        },
        "statement": {
            "gross_sales": str(gross_sales),
            "discounts": str(discounts),
            "net_sales": str(net_sales),
            "tax_collected": str(tax_collected),
            "total_sales_collected": str(total_sales_collected),
            "cost_of_goods_sold": str(cogs),
            "gross_profit": str(gross_profit),
            "gross_margin_pct": str(gross_margin_pct),
            "operating_expenses": str(operating_expenses),
            "net_profit": str(net_profit),
            "net_margin_pct": str(net_margin_pct),
            "purchasing_received_total": str(_q_money(purchase_agg["total"])),
        },
        "expense_breakdown": expense_breakdown,
    }


def get_purchasing_report(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    """Generate Purchasing summary grouped by status and supplier."""
    zero_money = Value(Decimal("0.00"), output_field=MONEY_FIELD)
    qs = Purchase.objects.select_related("supplier").all()

    if date_from is not None:
        qs = qs.filter(purchase_date__gte=date_from)
    if date_to is not None:
        qs = qs.filter(purchase_date__lte=date_to)

    by_status = [
        {
            "status": row["status"],
            "count": row["count"],
            "total_amount": str(_q_money(row["total_amount"])),
        }
        for row in qs.values("status")
        .annotate(
            count=Count("id"),
            total_amount=Coalesce(Sum("total_amount"), zero_money),
        )
        .order_by("status")
    ]

    received_qs = qs.filter(status=Purchase.Status.RECEIVED)
    received_agg = received_qs.aggregate(
        count=Count("id"),
        total=Coalesce(Sum("total_amount"), zero_money),
    )

    by_supplier = [
        {
            "supplier_id": row["supplier_id"],
            "supplier_name": row["supplier__name"],
            "received_count": row["received_count"],
            "received_total": str(_q_money(row["received_total"])),
        }
        for row in received_qs.values("supplier_id", "supplier__name")
        .annotate(
            received_count=Count("id"),
            received_total=Coalesce(Sum("total_amount"), zero_money),
        )
        .order_by("-received_total", "supplier__name")
    ]

    return {
        "filters": {
            "date_from": str(date_from) if date_from else None,
            "date_to": str(date_to) if date_to else None,
        },
        "summary": {
            "total_orders": qs.count(),
            "received_orders": received_agg["count"],
            "received_total": str(_q_money(received_agg["total"])),
        },
        "by_status": by_status,
        "by_supplier": by_supplier,
    }


def build_report_csv(
    *,
    actor,
    report_type: str,
    date_from: date | None = None,
    date_to: date | None = None,
    ip_address: str | None = None,
) -> tuple[str, str]:
    """Build sanitized CSV export for supported report types and record audit event."""
    clean_type = (report_type or "").strip().lower()
    if clean_type not in {"sales", "pnl", "inventory", "purchasing"}:
        raise ValidationError(
            {"type": ["Supported export types are: sales, pnl, inventory, purchasing."]}
        )

    buf = io.StringIO()
    writer = csv.writer(buf)

    if clean_type == "sales":
        report = get_sales_report(date_from=date_from, date_to=date_to)
        writer.writerow(["Date", "Sales Count", "Revenue", "Discounts", "Tax"])
        for row in report["daily_breakdown"]:
            writer.writerow(
                [
                    _safe_csv_cell(row["date"]),
                    _safe_csv_cell(row["sales_count"]),
                    _safe_csv_cell(row["revenue"]),
                    _safe_csv_cell(row["discounts"]),
                    _safe_csv_cell(row["tax"]),
                ]
            )
    elif clean_type == "pnl":
        report = get_profit_and_loss_report(date_from=date_from, date_to=date_to)
        stmt = report["statement"]
        writer.writerow(["Metric", "Amount"])
        for label, key in [
            ("Gross Sales", "gross_sales"),
            ("Discounts", "discounts"),
            ("Net Sales", "net_sales"),
            ("Tax Collected", "tax_collected"),
            ("Cost of Goods Sold (COGS)", "cost_of_goods_sold"),
            ("Gross Profit", "gross_profit"),
            ("Gross Margin (%)", "gross_margin_pct"),
            ("Operating Expenses", "operating_expenses"),
            ("Net Profit", "net_profit"),
            ("Net Margin (%)", "net_margin_pct"),
        ]:
            writer.writerow([label, _safe_csv_cell(stmt[key])])
    elif clean_type == "inventory":
        report = get_inventory_valuation_report()
        writer.writerow(["Category", "Product Count", "Total Quantity", "Stock Valuation", "Retail Valuation"])
        for row in report["by_category"]:
            writer.writerow(
                [
                    _safe_csv_cell(row["category_name"]),
                    _safe_csv_cell(row["product_count"]),
                    _safe_csv_cell(row["total_quantity"]),
                    _safe_csv_cell(row["stock_valuation"]),
                    _safe_csv_cell(row["retail_valuation"]),
                ]
            )
    else:  # purchasing
        report = get_purchasing_report(date_from=date_from, date_to=date_to)
        writer.writerow(["Supplier", "Received Orders", "Received Total"])
        for row in report["by_supplier"]:
            writer.writerow(
                [
                    _safe_csv_cell(row["supplier_name"]),
                    _safe_csv_cell(row["received_count"]),
                    _safe_csv_cell(row["received_total"]),
                ]
            )

    today_str = timezone.localdate().strftime("%Y%m%d")
    filename = f"pos_{clean_type}_report_{today_str}.csv"

    log_audit_event(
        actor=actor,
        action="report.exported",
        target_type="Report",
        target_id=clean_type,
        ip_address=ip_address,
        metadata={
            "report_type": clean_type,
            "date_from": str(date_from) if date_from else None,
            "date_to": str(date_to) if date_to else None,
            "filename": filename,
        },
    )
    return filename, buf.getvalue()
