"""Automated tests for Inventory movements, balances, valuation, alerts, RBAC, and concurrency."""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import threading

from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection
from django.db.models import Sum
from django.test import TransactionTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.catalog.models import Category, Product, Unit
from apps.inventory.models import StockBalance, StockMovement
from apps.inventory.services import record_opening_stock, record_stock_out
from apps.rbac.models import Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


class InventoryAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        sync_default_rbac()
        cls.manager_role = Role.objects.get(slug="manager")
        cls.clerk_role = Role.objects.get(slug="inventory_clerk")
        cls.cashier_role = Role.objects.get(slug="cashier")

        cls.manager = User.objects.create_user(
            username="inv_manager",
            email="inv_manager@pos.local",
            password="ManagerPass!2026",
            full_name="Inventory Manager",
        )
        cls.manager.roles.add(cls.manager_role)

        cls.clerk = User.objects.create_user(
            username="inv_clerk",
            email="inv_clerk@pos.local",
            password="ClerkPass!2026",
            full_name="Stock Clerk",
        )
        cls.clerk.roles.add(cls.clerk_role)

        cls.cashier = User.objects.create_user(
            username="inv_cashier",
            email="inv_cashier@pos.local",
            password="CashierPass!2026",
            full_name="Front Cashier",
        )
        cls.cashier.roles.add(cls.cashier_role)

        cls.no_role = User.objects.create_user(
            username="inv_norole",
            email="inv_norole@pos.local",
            password="NoRolePass!2026",
        )

        cls.cat_drinks = Category.objects.create(name="Drinks", slug="drinks")
        cls.cat_food = Category.objects.create(name="Food", slug="food")
        cls.unit_pcs = Unit.objects.create(
            name="Piece", abbreviation="pcs", unit_type="count", allow_decimal=False
        )
        cls.unit_kg = Unit.objects.create(
            name="Kilogram", abbreviation="kg", unit_type="weight", allow_decimal=True
        )

        cls.cola = Product.objects.create(
            sku="DRK-COLA",
            name="Cola Can",
            name_km="កូឡា",
            category=cls.cat_drinks,
            unit=cls.unit_pcs,
            purchase_cost=Decimal("0.50"),
            selling_price=Decimal("1.00"),
            min_stock_threshold=Decimal("10.000"),
        )
        cls.rice = Product.objects.create(
            sku="FD-RICE",
            name="Jasmine Rice",
            name_km="អង្ករផ្កាម្លិះ",
            category=cls.cat_food,
            unit=cls.unit_kg,
            purchase_cost=Decimal("1.20"),
            selling_price=Decimal("2.00"),
            min_stock_threshold=Decimal("5.000"),
        )

    def setUp(self) -> None:
        self.balances_url = reverse("api-v1-inventory-balances")
        self.low_stock_url = reverse("api-v1-inventory-low-stock")
        self.movements_url = reverse("api-v1-inventory-movements")
        self.opening_url = reverse("api-v1-inventory-opening-stock")
        self.stock_in_url = reverse("api-v1-inventory-stock-in")
        self.stock_out_url = reverse("api-v1-inventory-stock-out")
        self.adjust_url = reverse("api-v1-inventory-adjustments")
        self.report_url = reverse("api-v1-inventory-report")

    def _auth(self, user: User | None) -> None:
        self.client.force_authenticate(user=user)

    def test_opening_stock_and_duplicate_opening_blocked(self) -> None:
        self._auth(self.clerk)
        resp = self.client.post(
            self.opening_url,
            {
                "product": self.cola.id,
                "quantity": "20",
                "unit_cost": "0.50",
                "reference_code": "OPEN-001",
                "notes": "Initial store count",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["movement_type"], "opening")
        self.assertEqual(resp.data["balance_before"], "0.000")
        self.assertEqual(resp.data["balance_after"], "20.000")
        self.assertEqual(resp.data["total_cost"], "10.00")

        # Duplicate opening stock for same product blocked (409 Conflict)
        dup = self.client.post(
            self.opening_url,
            {"product": self.cola.id, "quantity": "10"},
            format="json",
        )
        self.assertEqual(dup.status_code, status.HTTP_409_CONFLICT)

        bal = StockBalance.objects.get(product=self.cola)
        self.assertEqual(bal.quantity_on_hand, Decimal("20.000"))
        self.assertEqual(bal.average_unit_cost, Decimal("0.50"))
        self.assertTrue(AuditLog.objects.filter(action="inventory.opening").exists())

    def test_stock_in_out_adjustments_weighted_average_and_ledger_invariant(self) -> None:
        self._auth(self.manager)

        # 1. Opening: 10 @ $1.00 = $10.00
        self.assertEqual(
            self.client.post(
                self.opening_url,
                {"product": self.rice.id, "quantity": "10.000", "unit_cost": "1.00"},
                format="json",
            ).status_code,
            status.HTTP_201_CREATED,
        )

        # 2. Stock In: +10 @ $2.00 -> 20 @ avg $1.50
        in_resp = self.client.post(
            self.stock_in_url,
            {
                "product": self.rice.id,
                "quantity": "10.000",
                "unit_cost": "2.00",
                "reference_code": "RCV-101",
                "notes": "Supplier delivery",
            },
            format="json",
        )
        self.assertEqual(in_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(in_resp.data["balance_after"], "20.000")

        bal = StockBalance.objects.get(product=self.rice)
        self.assertEqual(bal.quantity_on_hand, Decimal("20.000"))
        self.assertEqual(bal.average_unit_cost, Decimal("1.50"))

        # 3. Stock Out: -4.500 kg (allowed since kg allow_decimal=True) -> 15.500
        out_resp = self.client.post(
            self.stock_out_url,
            {
                "product": self.rice.id,
                "quantity": "4.500",
                "reference_code": "OUT-201",
                "notes": "Kitchen transfer",
            },
            format="json",
        )
        self.assertEqual(out_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(out_resp.data["quantity_delta"], "-4.500")
        self.assertEqual(out_resp.data["balance_after"], "15.500")

        # 4. Adjustment decrease requires notes
        no_notes = self.client.post(
            self.adjust_url,
            {"product": self.rice.id, "direction": "decrease", "quantity": "1.000", "notes": ""},
            format="json",
        )
        self.assertEqual(no_notes.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Valid adjustment decrease (-1.500) and increase (+0.500) -> 14.500
        adj_dec = self.client.post(
            self.adjust_url,
            {
                "product": self.rice.id,
                "direction": "decrease",
                "quantity": "1.500",
                "reference_code": "ADJ-001",
                "notes": "Spillage write-off",
            },
            format="json",
        )
        self.assertEqual(adj_dec.status_code, status.HTTP_201_CREATED)
        self.assertEqual(adj_dec.data["balance_after"], "14.000")

        adj_inc = self.client.post(
            self.adjust_url,
            {
                "product": self.rice.id,
                "direction": "increase",
                "quantity": "0.500",
                "unit_cost": "1.50",
                "reference_code": "ADJ-002",
                "notes": "Recount surplus",
            },
            format="json",
        )
        self.assertEqual(adj_inc.status_code, status.HTTP_201_CREATED)
        self.assertEqual(adj_inc.data["balance_after"], "14.500")

        # Verify ledger conservation invariant: SUM(quantity_delta) == StockBalance.quantity_on_hand
        ledger_sum = StockMovement.objects.filter(product=self.rice).aggregate(
            total=Sum("quantity_delta")
        )["total"]
        bal.refresh_from_db()
        self.assertEqual(ledger_sum, bal.quantity_on_hand)
        self.assertEqual(bal.quantity_on_hand, Decimal("14.500"))

        # Verify movement history filtering & search
        hist = self.client.get(f"{self.movements_url}?product={self.rice.id}&movement_type=adjustment")
        self.assertEqual(hist.status_code, status.HTTP_200_OK)
        self.assertEqual(hist.data["count"], 2)

        # Real DB PROTECT: product with stock movements cannot be deleted (409 Conflict)
        prod_del = self.client.delete(reverse("product-detail", kwargs={"pk": self.rice.id}))
        self.assertEqual(prod_del.status_code, status.HTTP_409_CONFLICT)

    def test_negative_stock_prevention_and_decimal_unit_enforcement(self) -> None:
        self._auth(self.manager)
        self.client.post(
            self.opening_url,
            {"product": self.cola.id, "quantity": "5"},
            format="json",
        )

        # Fractional quantity rejected for non-decimal unit (pcs)
        frac = self.client.post(
            self.stock_in_url,
            {"product": self.cola.id, "quantity": "1.500"},
            format="json",
        )
        self.assertEqual(frac.status_code, status.HTTP_400_BAD_REQUEST)

        # Stock out exceeding available 5 -> rejected & atomic rollback leaves balance 5 and 1 movement
        oversell = self.client.post(
            self.stock_out_url,
            {"product": self.cola.id, "quantity": "6"},
            format="json",
        )
        self.assertEqual(oversell.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(StockBalance.objects.get(product=self.cola).quantity_on_hand, Decimal("5.000"))
        self.assertEqual(StockMovement.objects.filter(product=self.cola).count(), 1)

        # Negative adjustment exceeding balance also blocked
        over_adj = self.client.post(
            self.adjust_url,
            {
                "product": self.cola.id,
                "direction": "decrease",
                "quantity": "10",
                "notes": "Excess deduction",
            },
            format="json",
        )
        self.assertEqual(over_adj.status_code, status.HTTP_400_BAD_REQUEST)

        # When business rule explicitly enables negative stock, deduction is permitted
        with override_settings(INVENTORY_ALLOW_NEGATIVE_STOCK=True):
            allowed = self.client.post(
                self.stock_out_url,
                {"product": self.cola.id, "quantity": "7"},
                format="json",
            )
            self.assertEqual(allowed.status_code, status.HTTP_201_CREATED)
            self.assertEqual(allowed.data["balance_after"], "-2.000")

    def test_low_stock_alerts_and_inventory_valuation_report(self) -> None:
        self._auth(self.manager)
        # Cola: threshold 10, stock 4 @ $0.50 -> low_stock, value $2.00, shortage 6
        self.client.post(
            self.opening_url,
            {"product": self.cola.id, "quantity": "4", "unit_cost": "0.50"},
            format="json",
        )
        # Rice: threshold 5, stock 10 @ $1.20 -> in_stock, value $12.00
        self.client.post(
            self.opening_url,
            {"product": self.rice.id, "quantity": "10", "unit_cost": "1.20"},
            format="json",
        )

        # Low-stock alert list contains only Cola
        alerts = self.client.get(self.low_stock_url)
        self.assertEqual(alerts.status_code, status.HTTP_200_OK)
        self.assertEqual(alerts.data["count"], 1)
        self.assertEqual(alerts.data["results"][0]["sku"], "DRK-COLA")
        self.assertEqual(alerts.data["results"][0]["shortage"], "6.000")
        self.assertEqual(alerts.data["results"][0]["stock_status"], "low_stock")

        # Valuation report computes exact Decimal totals ($2.00 + $12.00 = $14.00)
        report = self.client.get(self.report_url)
        self.assertEqual(report.status_code, status.HTTP_200_OK)
        summary = report.data["summary"]
        self.assertEqual(summary["total_tracked_products"], 2)
        self.assertEqual(summary["total_stock_valuation"], "14.00")
        self.assertEqual(summary["low_stock_count"], 1)
        self.assertEqual(summary["out_of_stock_count"], 0)
        self.assertEqual(len(report.data["by_category"]), 2)

    def test_permissions_and_no_arbitrary_balance_editing(self) -> None:
        # Unauthenticated -> 401
        self._auth(None)
        self.assertEqual(self.client.get(self.balances_url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            self.client.post(self.stock_in_url, {"product": self.cola.id, "quantity": "1"}).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        # User with no permissions -> 403
        self._auth(self.no_role)
        self.assertEqual(self.client.get(self.balances_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(self.movements_url).status_code, status.HTTP_403_FORBIDDEN)

        # Cashier has inventory.view ONLY -> read succeeds, all mutations rejected (403)
        self._auth(self.cashier)
        self.assertEqual(self.client.get(self.balances_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.movements_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.low_stock_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.report_url).status_code, status.HTTP_200_OK)

        for url, payload in (
            (self.opening_url, {"product": self.cola.id, "quantity": "5"}),
            (self.stock_in_url, {"product": self.cola.id, "quantity": "5"}),
            (self.stock_out_url, {"product": self.cola.id, "quantity": "1"}),
            (
                self.adjust_url,
                {"product": self.cola.id, "direction": "increase", "quantity": "1", "notes": "Test"},
            ),
        ):
            self.assertEqual(
                self.client.post(url, payload, format="json").status_code,
                status.HTTP_403_FORBIDDEN,
                f"Expected 403 for cashier on {url}",
            )

        # Direct mutation attempts on read-only endpoints return 405 Method Not Allowed
        self._auth(self.manager)
        self.assertEqual(
            self.client.post(self.balances_url, {}, format="json").status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.put(self.balances_url, {}, format="json").status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.delete(self.movements_url).status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class InventoryConcurrencyTestCase(TransactionTestCase):
    """Verify transactional stock deduction never oversells under concurrent requests."""

    def test_concurrent_stock_out_prevents_negative_balance(self) -> None:
        if connection.vendor == "sqlite" and ":memory:" in str(connection.settings_dict.get("NAME", "")):
            # File-backed or shared-cache DBs handle multi-thread locking; verify cleanly if shared cache is active.
            pass

        sync_default_rbac()
        user = User.objects.create_user(
            username="conc_admin",
            email="conc_admin@pos.local",
            password="StrongPass!2026",
        )
        cat = Category.objects.create(name="Concurrent Cat", slug="concurrent-cat")
        unit = Unit.objects.create(name="Unit", abbreviation="u", unit_type="count")
        prod = Product.objects.create(
            sku="CONC-001",
            name="Limited Stock Item",
            category=cat,
            unit=unit,
            purchase_cost=Decimal("1.00"),
            selling_price=Decimal("2.00"),
        )
        record_opening_stock(actor=user, product=prod, quantity=Decimal("10.000"))

        barrier = threading.Barrier(2)

        def attempt_deduction():
            close_old_connections()
            try:
                barrier.wait(timeout=5)
                record_stock_out(actor=user, product=prod, quantity=Decimal("7.000"), notes="Concurrent out")
                return "ok"
            except ValidationError:
                return "insufficient"
            except Exception as exc:
                # SQLite busy lock under simultaneous write also prevents oversell safely
                if "locked" in str(exc).lower():
                    return "locked"
                raise
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: attempt_deduction(), range(2)))

        bal = StockBalance.objects.get(product=prod)
        ledger_sum = StockMovement.objects.filter(product=prod).aggregate(total=Sum("quantity_delta"))["total"]

        # At most one 7-unit deduction may succeed from 10 units; balance can never go negative
        self.assertEqual(results.count("ok"), 1, f"Unexpected concurrent outcomes: {results}")
        self.assertEqual(bal.quantity_on_hand, Decimal("3.000"))
        self.assertEqual(ledger_sum, bal.quantity_on_hand)
