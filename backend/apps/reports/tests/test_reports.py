"""Automated tests for Dashboard KPIs, Sales, Profit & Loss, Purchasing Reports, CSV Export, and RBAC."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.catalog.models import Category, Product, Unit
from apps.expenses.models import Expense, ExpenseCategory
from apps.inventory.services import record_opening_stock
from apps.purchasing.models import Supplier
from apps.purchasing.services import create_purchase, receive_purchase
from apps.rbac.models import Role
from apps.sales.services import checkout_sale

User = get_user_model()


class ReportsAndDashboardAPITestCase(APITestCase):
    def setUp(self):
        call_command("seed_rbac")
        self.manager = self._create_user_with_role("rep_mgr", "manager")
        self.accountant = self._create_user_with_role("rep_acct", "accountant")
        self.cashier = self._create_user_with_role("rep_cashier", "cashier")
        self.clerk = self._create_user_with_role("rep_clerk", "inventory_clerk")

        today = timezone.localdate()
        self.today = today

        cat = Category.objects.create(name="Drinks", slug="drinks")
        unit = Unit.objects.create(name="Cup", abbreviation="cup", unit_type=Unit.UnitType.COUNT)
        self.tea = Product.objects.create(
            sku="REP-TEA-01",
            name="Green Tea",
            category=cat,
            unit=unit,
            purchase_cost=Decimal("2.00"),
            selling_price=Decimal("5.00"),
            tax_rate=Decimal("10.00"),
            min_stock_threshold=Decimal("5.000"),
            track_inventory=True,
        )
        # Opening 10 units @ $2.00
        record_opening_stock(
            actor=self.manager,
            product=self.tea,
            quantity=Decimal("10.000"),
            unit_cost=Decimal("2.00"),
        )

        # Received PO: 5 units @ $2.00 = $10.00 (balance becomes 15, avg cost $2.00)
        supplier = Supplier.objects.create(name="Highland Tea Co")
        po = create_purchase(
            actor=self.manager,
            supplier=supplier,
            purchase_date=today,
            items=[{"product": self.tea, "quantity": Decimal("5.000"), "unit_cost": Decimal("2.00")}],
        )
        receive_purchase(actor=self.manager, purchase=po)

        # Sale: 11 units @ $5.00 = $55.00 subtotal, $5.00 discount -> $50.00 net sales,
        # 10% tax = $5.00 -> $55.00 total collected.
        # COGS = 11 * $2.00 = $22.00; Gross Profit = $50.00 - $22.00 = $28.00 (56.00% margin)
        # Remaining stock = 4.000 <= min_stock_threshold 5.000 -> triggers 1 low-stock alert!
        checkout_sale(
            actor=self.manager,
            items=[{"product": self.tea, "quantity": Decimal("11.000")}],
            discount_amount=Decimal("5.00"),
            payment_method="cash",
            paid_amount=Decimal("60.00"),
        )

        # Operating Expense: $8.00 -> Net Profit = $28.00 - $8.00 = $20.00 (40.00% margin)
        exp_cat = ExpenseCategory.objects.create(name="Rent")
        Expense.objects.create(
            expense_number="EXP-REP-001",
            category=exp_cat,
            title="Shop Rent",
            amount=Decimal("8.00"),
            expense_date=today,
            payment_method=Expense.PaymentMethod.CASH,
            created_by=self.manager,
        )

    def _create_user_with_role(self, username: str, role_slug: str) -> User:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="Password123!",
            is_active=True,
        )
        user.roles.add(Role.objects.get(slug=role_slug))
        return user

    def _auth(self, user: User):
        self.client.force_authenticate(user=user)

    def test_dashboard_kpis_sales_pnl_and_purchasing_reports_exact_decimal_math(self):
        self._auth(self.manager)

        # Dashboard KPIs
        dash_res = self.client.get("/api/v1/reports/dashboard/")
        self.assertEqual(dash_res.status_code, status.HTTP_200_OK)
        kpis = dash_res.data["kpis"]
        self.assertEqual(kpis["today_sales_total"], "55.00")
        self.assertEqual(kpis["today_sales_count"], 1)
        self.assertEqual(kpis["mtd_expenses_total"], "8.00")
        self.assertEqual(kpis["low_stock_count"], 1)
        self.assertEqual(len(dash_res.data["recent_sales"]), 1)
        self.assertEqual(len(dash_res.data["low_stock_items"]), 1)

        # Sales Report
        sales_res = self.client.get(
            f"/api/v1/reports/sales/?date_from={self.today}&date_to={self.today}"
        )
        self.assertEqual(sales_res.status_code, status.HTTP_200_OK)
        self.assertEqual(sales_res.data["summary"]["net_revenue"], "55.00")
        self.assertEqual(sales_res.data["summary"]["total_discount"], "5.00")
        self.assertEqual(sales_res.data["summary"]["total_tax"], "5.00")
        self.assertEqual(sales_res.data["top_products"][0]["sku"], "REP-TEA-01")
        self.assertEqual(sales_res.data["top_products"][0]["cogs"], "22.00")

        # Profit & Loss Report
        pnl_res = self.client.get(
            f"/api/v1/reports/profit-loss/?date_from={self.today}&date_to={self.today}"
        )
        self.assertEqual(pnl_res.status_code, status.HTTP_200_OK)
        stmt = pnl_res.data["statement"]
        self.assertEqual(stmt["gross_sales"], "55.00")
        self.assertEqual(stmt["discounts"], "5.00")
        self.assertEqual(stmt["net_sales"], "50.00")
        self.assertEqual(stmt["cost_of_goods_sold"], "22.00")
        self.assertEqual(stmt["gross_profit"], "28.00")
        self.assertEqual(stmt["gross_margin_pct"], "56.00")
        self.assertEqual(stmt["operating_expenses"], "8.00")
        self.assertEqual(stmt["net_profit"], "20.00")
        self.assertEqual(stmt["net_margin_pct"], "40.00")
        self.assertEqual(stmt["purchasing_received_total"], "10.00")

        # Purchasing Report
        po_res = self.client.get(
            f"/api/v1/reports/purchasing/?date_from={self.today}&date_to={self.today}"
        )
        self.assertEqual(po_res.status_code, status.HTTP_200_OK)
        self.assertEqual(po_res.data["summary"]["received_total"], "10.00")
        self.assertEqual(po_res.data["by_supplier"][0]["supplier_name"], "Highland Tea Co")

    def test_csv_export_audit_logging_and_rbac_enforcement(self):
        # Unauthenticated blocked
        self.assertEqual(
            self.client.get("/api/v1/reports/dashboard/").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        # Cashier has dashboard.view but NOT reports.view or reports.export
        self._auth(self.cashier)
        self.assertEqual(
            self.client.get("/api/v1/reports/dashboard/").status_code, status.HTTP_200_OK
        )
        self.assertEqual(
            self.client.get("/api/v1/reports/sales/").status_code, status.HTTP_403_FORBIDDEN
        )
        self.assertEqual(
            self.client.get("/api/v1/reports/export/?type=pnl").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        # Accountant has reports.view and reports.export
        self._auth(self.accountant)
        export_res = self.client.get("/api/v1/reports/export/?type=pnl")
        self.assertEqual(export_res.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", export_res["Content-Type"])
        csv_body = export_res.content.decode("utf-8")
        self.assertIn("Gross Profit,28.00", csv_body)
        self.assertIn("Net Profit,20.00", csv_body)
        self.assertTrue(
            AuditLog.objects.filter(action="report.exported", target_id="pnl").exists()
        )

        # Invalid export type rejected with 400
        self.assertEqual(
            self.client.get("/api/v1/reports/export/?type=invalid").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
