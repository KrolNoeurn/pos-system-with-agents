"""Automated tests for Purchasing, Goods Receiving, Inventory integration, validation, and RBAC."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.catalog.models import Category, Product, Unit
from apps.inventory.models import StockBalance, StockMovement
from apps.purchasing.models import Purchase, Supplier
from apps.rbac.models import Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


class PurchasingAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        sync_default_rbac()
        cls.manager_role = Role.objects.get(slug="manager")
        cls.clerk_role = Role.objects.get(slug="inventory_clerk")
        cls.accountant_role = Role.objects.get(slug="accountant")
        cls.cashier_role = Role.objects.get(slug="cashier")

        cls.manager = User.objects.create_user(
            username="po_manager",
            email="po_manager@pos.local",
            password="ManagerPass!2026",
        )
        cls.manager.roles.add(cls.manager_role)

        cls.clerk = User.objects.create_user(
            username="po_clerk",
            email="po_clerk@pos.local",
            password="ClerkPass!2026",
        )
        cls.clerk.roles.add(cls.clerk_role)

        cls.accountant = User.objects.create_user(
            username="po_accountant",
            email="po_accountant@pos.local",
            password="AccountantPass!2026",
        )
        cls.accountant.roles.add(cls.accountant_role)

        cls.cashier = User.objects.create_user(
            username="po_cashier",
            email="po_cashier@pos.local",
            password="CashierPass!2026",
        )
        cls.cashier.roles.add(cls.cashier_role)

        cls.cat = Category.objects.create(name="Groceries", slug="groceries")
        cls.unit_pcs = Unit.objects.create(name="Piece", abbreviation="pcs", unit_type="count", allow_decimal=False)
        cls.unit_kg = Unit.objects.create(name="Kilogram", abbreviation="kg", unit_type="weight", allow_decimal=True)

        cls.coffee = Product.objects.create(
            sku="PO-COF",
            name="Coffee Pack",
            category=cls.cat,
            unit=cls.unit_pcs,
            purchase_cost=Decimal("4.00"),
            selling_price=Decimal("7.00"),
        )
        cls.sugar = Product.objects.create(
            sku="PO-SUG",
            name="White Sugar",
            category=cls.cat,
            unit=cls.unit_kg,
            purchase_cost=Decimal("1.00"),
            selling_price=Decimal("1.80"),
        )
        cls.supplier = Supplier.objects.create(
            name="Mekong Wholesale Co.",
            contact_name="Dara",
            phone="012345678",
        )

    def setUp(self) -> None:
        self.suppliers_url = reverse("supplier-list")
        self.purchases_url = reverse("purchase-list")

    def _auth(self, user: User | None) -> None:
        self.client.force_authenticate(user=user)

    def test_purchase_draft_does_not_change_stock_and_receiving_updates_inventory_once(self) -> None:
        self._auth(self.manager)

        # 1. Create draft purchase: 10 Coffee @ $4.50 ($45.00) + 5.5 kg Sugar @ $1.20 ($6.60) = $51.60 - $1.60 discount = $50.00
        create_resp = self.client.post(
            self.purchases_url,
            {
                "supplier": self.supplier.id,
                "discount_amount": "1.60",
                "notes": "Weekly restock",
                "items": [
                    {"product": self.coffee.id, "quantity": "10", "unit_cost": "4.50"},
                    {"product": self.sugar.id, "quantity": "5.500", "unit_cost": "1.20"},
                ],
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        po_id = create_resp.data["id"]
        po_num = create_resp.data["purchase_number"]
        self.assertEqual(create_resp.data["status"], "draft")
        self.assertEqual(create_resp.data["subtotal"], "51.60")
        self.assertEqual(create_resp.data["discount_amount"], "1.60")
        self.assertEqual(create_resp.data["total_amount"], "50.00")
        self.assertEqual(len(create_resp.data["items"]), 2)

        # CRITICAL RULE: Stock MUST NOT increase when draft is created
        self.assertEqual(StockBalance.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)

        # 2. Receive goods -> updates status, creates PURCHASE StockMovements via inventory service
        receive_url = reverse("purchase-receive", kwargs={"pk": po_id})
        rcv_resp = self.client.post(receive_url, {"notes": "Checked box count"}, format="json")
        self.assertEqual(rcv_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(rcv_resp.data["status"], "received")
        self.assertIsNotNone(rcv_resp.data["received_at"])

        # Inventory balances & movements updated accurately
        coffee_bal = StockBalance.objects.get(product=self.coffee)
        sugar_bal = StockBalance.objects.get(product=self.sugar)
        self.assertEqual(coffee_bal.quantity_on_hand, Decimal("10.000"))
        self.assertEqual(coffee_bal.average_unit_cost, Decimal("4.50"))
        self.assertEqual(sugar_bal.quantity_on_hand, Decimal("5.500"))
        self.assertEqual(sugar_bal.average_unit_cost, Decimal("1.20"))

        movements = StockMovement.objects.filter(reference_code=po_num)
        self.assertEqual(movements.count(), 2)
        self.assertTrue(all(m.movement_type == StockMovement.MovementType.PURCHASE for m in movements))
        self.assertTrue(AuditLog.objects.filter(action="purchase.received", target_id=str(po_id)).exists())

        # 3. Duplicate receiving blocked (409 Conflict) — stock is NOT doubled
        dup_rcv = self.client.post(receive_url, {}, format="json")
        self.assertEqual(dup_rcv.status_code, status.HTTP_409_CONFLICT)
        coffee_bal.refresh_from_db()
        self.assertEqual(coffee_bal.quantity_on_hand, Decimal("10.000"))

        # 4. Received purchase cannot be edited or cancelled or deleted (preserves history)
        detail_url = reverse("purchase-detail", kwargs={"pk": po_id})
        self.assertEqual(
            self.client.patch(detail_url, {"notes": "Tamper"}, format="json").status_code,
            status.HTTP_409_CONFLICT,
        )
        self.assertEqual(
            self.client.post(reverse("purchase-cancel", kwargs={"pk": po_id}), {}, format="json").status_code,
            status.HTTP_409_CONFLICT,
        )
        self.assertIn(
            self.client.delete(detail_url).status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED),
        )
        self.assertTrue(Purchase.objects.filter(pk=po_id).exists())

        # 5. Real DB PROTECT: product in purchase history cannot be deleted
        self.assertEqual(
            self.client.delete(reverse("product-detail", kwargs={"pk": self.coffee.id})).status_code,
            status.HTTP_409_CONFLICT,
        )

    def test_edit_draft_and_cancel_purchase_blocks_receiving(self) -> None:
        self._auth(self.manager)
        created = self.client.post(
            self.purchases_url,
            {
                "supplier": self.supplier.id,
                "items": [{"product": self.coffee.id, "quantity": "5", "unit_cost": "4.00"}],
            },
            format="json",
        )
        po_id = created.data["id"]

        # Edit draft quantity & discount
        edited = self.client.patch(
            reverse("purchase-detail", kwargs={"pk": po_id}),
            {
                "discount_amount": "2.00",
                "items": [{"product": self.coffee.id, "quantity": "8", "unit_cost": "4.00"}],
            },
            format="json",
        )
        self.assertEqual(edited.status_code, status.HTTP_200_OK)
        self.assertEqual(edited.data["subtotal"], "32.00")
        self.assertEqual(edited.data["total_amount"], "30.00")

        # Cancel draft
        cancelled = self.client.post(
            reverse("purchase-cancel", kwargs={"pk": po_id}),
            {"reason": "Supplier out of stock"},
            format="json",
        )
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK)
        self.assertEqual(cancelled.data["status"], "cancelled")
        self.assertEqual(cancelled.data["cancellation_reason"], "Supplier out of stock")

        # Cannot receive cancelled purchase (409) and stock remains untouched
        rcv_cancelled = self.client.post(
            reverse("purchase-receive", kwargs={"pk": po_id}),
            {},
            format="json",
        )
        self.assertEqual(rcv_cancelled.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(StockBalance.objects.count(), 0)

    def test_validation_rules_quantities_prices_discount_and_duplicates(self) -> None:
        self._auth(self.manager)

        # Empty items rejected
        self.assertEqual(
            self.client.post(
                self.purchases_url,
                {"supplier": self.supplier.id, "items": []},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Duplicate product line rejected
        self.assertEqual(
            self.client.post(
                self.purchases_url,
                {
                    "supplier": self.supplier.id,
                    "items": [
                        {"product": self.coffee.id, "quantity": "2", "unit_cost": "4.00"},
                        {"product": self.coffee.id, "quantity": "3", "unit_cost": "4.00"},
                    ],
                },
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Fractional qty on non-decimal unit (pcs) rejected
        self.assertEqual(
            self.client.post(
                self.purchases_url,
                {
                    "supplier": self.supplier.id,
                    "items": [{"product": self.coffee.id, "quantity": "1.500", "unit_cost": "4.00"}],
                },
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Negative unit cost rejected
        self.assertEqual(
            self.client.post(
                self.purchases_url,
                {
                    "supplier": self.supplier.id,
                    "items": [{"product": self.coffee.id, "quantity": "2", "unit_cost": "-1.00"}],
                },
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Discount exceeding subtotal rejected
        self.assertEqual(
            self.client.post(
                self.purchases_url,
                {
                    "supplier": self.supplier.id,
                    "discount_amount": "50.00",
                    "items": [{"product": self.coffee.id, "quantity": "2", "unit_cost": "4.00"}],
                },
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_permissions_for_create_receive_and_cancel(self) -> None:
        # Unauthenticated -> 401
        self._auth(None)
        self.assertEqual(self.client.get(self.purchases_url).status_code, status.HTTP_401_UNAUTHORIZED)

        # Cashier has no purchases.* permissions -> 403
        self._auth(self.cashier)
        self.assertEqual(self.client.get(self.purchases_url).status_code, status.HTTP_403_FORBIDDEN)

        # Inventory Clerk can create & receive, CANNOT cancel (lacks purchases.cancel)
        self._auth(self.clerk)
        clerk_po = self.client.post(
            self.purchases_url,
            {
                "supplier": self.supplier.id,
                "items": [{"product": self.coffee.id, "quantity": "3", "unit_cost": "4.00"}],
            },
            format="json",
        )
        self.assertEqual(clerk_po.status_code, status.HTTP_201_CREATED)
        po_id = clerk_po.data["id"]

        self.assertEqual(
            self.client.post(reverse("purchase-cancel", kwargs={"pk": po_id}), {}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        # Accountant has purchases.view ONLY -> can view, CANNOT create/receive/cancel
        self._auth(self.accountant)
        self.assertEqual(self.client.get(self.purchases_url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.get(reverse("purchase-detail", kwargs={"pk": po_id})).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.post(reverse("purchase-receive", kwargs={"pk": po_id}), {}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(reverse("purchase-cancel", kwargs={"pk": po_id}), {}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        # Inventory Clerk CAN receive
        self._auth(self.clerk)
        rcv = self.client.post(reverse("purchase-receive", kwargs={"pk": po_id}), {}, format="json")
        self.assertEqual(rcv.status_code, status.HTTP_200_OK)
        self.assertEqual(rcv.data["status"], "received")
