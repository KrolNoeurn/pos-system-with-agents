"""Automated tests for Expense Categories, Operating Expenses, Cash Flow Summary, and RBAC."""

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


class ExpensesAndCashFlowAPITestCase(APITestCase):
    def setUp(self):
        call_command("seed_rbac")
        self.manager = self._create_user_with_role("exp_mgr", "manager")
        self.accountant = self._create_user_with_role("exp_acct", "accountant")
        self.cashier = self._create_user_with_role("exp_cashier", "cashier")
        self.clerk = self._create_user_with_role("exp_clerk", "inventory_clerk")

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

    def test_expense_category_and_expense_crud_delete_protection_and_audit(self):
        self._auth(self.manager)

        # Create expense category
        cat_res = self.client.post(
            "/api/v1/expense-categories/",
            {"name": "Utilities", "name_km": "ទឹក និងភ្លើង", "description": "Electricity and water"},
            format="json",
        )
        self.assertEqual(cat_res.status_code, status.HTTP_201_CREATED)
        cat_id = cat_res.data["id"]

        # Duplicate category name rejected (case-insensitive)
        dup_cat = self.client.post(
            "/api/v1/expense-categories/", {"name": "utilities"}, format="json"
        )
        self.assertEqual(dup_cat.status_code, status.HTTP_400_BAD_REQUEST)

        # Create expense
        today = str(timezone.localdate())
        exp_res = self.client.post(
            "/api/v1/expenses/",
            {
                "category": cat_id,
                "title": "Monthly Electricity Bill",
                "amount": "145.75",
                "expense_date": today,
                "payment_method": "bank_transfer",
                "reference_code": "EDC-2026-11",
                "vendor_name": "EDC",
                "notes": "Main store electricity",
            },
            format="json",
        )
        self.assertEqual(exp_res.status_code, status.HTTP_201_CREATED)
        exp_id = exp_res.data["id"]
        self.assertEqual(exp_res.data["amount"], "145.75")
        self.assertTrue(exp_res.data["expense_number"].startswith("EXP-"))

        # Category in use cannot be deleted (409 Conflict)
        del_cat = self.client.delete(f"/api/v1/expense-categories/{cat_id}/")
        self.assertEqual(del_cat.status_code, status.HTTP_409_CONFLICT)

        # Edit expense and verify audit event
        patch_res = self.client.patch(
            f"/api/v1/expenses/{exp_id}/",
            {"amount": "150.25", "notes": "Adjusted after late fee"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["amount"], "150.25")
        self.assertTrue(AuditLog.objects.filter(action="expense.updated", target_id=exp_id).exists())

        # Filter by payment_method and search
        list_res = self.client.get("/api/v1/expenses/?payment_method=bank_transfer&search=EDC")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(list_res.data["count"], 1)

        # Delete expense -> audit snapshot recorded; category now deletable
        del_exp = self.client.delete(f"/api/v1/expenses/{exp_id}/")
        self.assertEqual(del_exp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(AuditLog.objects.filter(action="expense.deleted", target_id=exp_id).exists())

        del_cat_ok = self.client.delete(f"/api/v1/expense-categories/{cat_id}/")
        self.assertEqual(del_cat_ok.status_code, status.HTTP_204_NO_CONTENT)

    def test_cash_flow_summary_combines_sales_received_purchases_and_expenses_in_decimal(self):
        self._auth(self.manager)
        today = timezone.localdate()

        # Seed catalog + stock + received PO + completed Sale + Expenses
        cat = Category.objects.create(name="Snacks", slug="snacks")
        unit = Unit.objects.create(name="Pack", abbreviation="pk", unit_type=Unit.UnitType.COUNT)
        prod = Product.objects.create(
            sku="CF-01",
            name="Chips",
            category=cat,
            unit=unit,
            purchase_cost=Decimal("2.00"),
            selling_price=Decimal("5.00"),
            track_inventory=True,
        )
        record_opening_stock(actor=self.manager, product=prod, quantity=Decimal("10.000"))

        supplier = Supplier.objects.create(name="CashFlow Supplier")
        po = create_purchase(
            actor=self.manager,
            supplier=supplier,
            purchase_date=today,
            items=[{"product": prod, "quantity": Decimal("5.000"), "unit_cost": Decimal("2.00")}],
        )
        receive_purchase(actor=self.manager, purchase=po)  # Purchasing outflow = $10.00

        # Draft PO (NOT received -> must NOT count toward purchasing outflow)
        create_purchase(
            actor=self.manager,
            supplier=supplier,
            purchase_date=today,
            items=[{"product": prod, "quantity": Decimal("50.000"), "unit_cost": Decimal("2.00")}],
        )

        # Completed Sale: 8 x $5.00 = $40.00 inflow
        checkout_sale(
            actor=self.manager,
            items=[{"product": prod, "quantity": Decimal("8.000")}],
            payment_method="cash",
            paid_amount=Decimal("40.00"),
        )

        # Operating expenses: $12.50 (Rent) + $3.25 (Supplies) = $15.75
        rent_cat = ExpenseCategory.objects.create(name="Rent")
        sup_cat = ExpenseCategory.objects.create(name="Supplies")
        Expense.objects.create(
            expense_number="EXP-TEST-0001",
            category=rent_cat,
            title="Daily stall fee",
            amount=Decimal("12.50"),
            expense_date=today,
            payment_method=Expense.PaymentMethod.CASH,
            created_by=self.manager,
        )
        Expense.objects.create(
            expense_number="EXP-TEST-0002",
            category=sup_cat,
            title="Receipt paper rolls",
            amount=Decimal("3.25"),
            expense_date=today,
            payment_method=Expense.PaymentMethod.QR,
            created_by=self.manager,
        )

        res = self.client.get(f"/api/v1/expenses/summary/?date_from={today}&date_to={today}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        cf = res.data["cash_flow"]
        self.assertEqual(cf["sales_inflow"], "40.00")
        self.assertEqual(cf["purchasing_outflow"], "10.00")
        self.assertEqual(cf["expense_outflow"], "15.75")
        self.assertEqual(cf["total_outflow"], "25.75")
        self.assertEqual(cf["net_cash_flow"], "14.25")
        self.assertEqual(len(res.data["by_category"]), 2)
        self.assertEqual(len(res.data["by_payment_method"]), 2)

    def test_validation_and_rbac_permissions_for_expenses(self):
        # Unauthenticated blocked
        self.assertEqual(self.client.get("/api/v1/expenses/").status_code, status.HTTP_401_UNAUTHORIZED)

        # Cashier & Inventory Clerk blocked (403)
        for user in (self.cashier, self.clerk):
            self._auth(user)
            self.assertEqual(self.client.get("/api/v1/expenses/").status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(
                self.client.get("/api/v1/expenses/summary/").status_code, status.HTTP_403_FORBIDDEN
            )

        # Accountant can create & edit expenses, but CANNOT delete (403)
        self._auth(self.accountant)
        cat = ExpenseCategory.objects.create(name="Office", is_active=True)
        inactive_cat = ExpenseCategory.objects.create(name="Archived", is_active=False)
        today = str(timezone.localdate())

        # Validation: zero/negative amount and inactive category rejected
        self.assertEqual(
            self.client.post(
                "/api/v1/expenses/",
                {"category": cat.id, "title": "Bad", "amount": "0.00", "expense_date": today},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/expenses/",
                {
                    "category": inactive_cat.id,
                    "title": "Bad Cat",
                    "amount": "10.00",
                    "expense_date": today,
                },
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Valid create & edit by accountant
        create_res = self.client.post(
            "/api/v1/expenses/",
            {"category": cat.id, "title": "Pens", "amount": "5.00", "expense_date": today},
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        exp_id = create_res.data["id"]

        edit_res = self.client.patch(
            f"/api/v1/expenses/{exp_id}/", {"amount": "6.50"}, format="json"
        )
        self.assertEqual(edit_res.status_code, status.HTTP_200_OK)

        # Delete blocked for accountant (lacks expenses.delete)
        self.assertEqual(
            self.client.delete(f"/api/v1/expenses/{exp_id}/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertTrue(Expense.objects.filter(pk=exp_id).exists())
