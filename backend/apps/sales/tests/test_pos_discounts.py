"""Tests for per-item and order-level (cash or percentage) POS checkout discounts & RBAC."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.services import create_category, create_product, create_unit
from apps.inventory.services import record_opening_stock
from apps.rbac.models import Permission, Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


class POSItemAndOrderDiscountTests(APITestCase):
    def setUp(self):
        sync_default_rbac()

        self.admin = User.objects.create_superuser(
            username="disc_admin",
            email="disc_admin@example.com",
            password="StrongPassword123!",
        )
        self.admin.roles.add(Role.objects.get(slug="super_admin"))

        no_disc_role = Role.objects.create(name="Cashier No Discount", slug="cashier-no-disc")
        no_disc_role.permissions.set(
            Permission.objects.filter(code__in=["sales.create", "sales.view"])
        )
        self.cashier_no_disc = User.objects.create_user(
            username="cashier_nodisc",
            email="cashier_nodisc@example.com",
            password="StrongPassword123!",
        )
        self.cashier_no_disc.roles.add(no_disc_role)

        cat = create_category(actor=self.admin, name="Drinks")
        unit = create_unit(actor=self.admin, name="Piece", abbreviation="pcs")

        self.latte = create_product(
            actor=self.admin,
            sku="LAT-01",
            name="Latte",
            category=cat,
            unit=unit,
            purchase_cost=Decimal("2.00"),
            selling_price=Decimal("10.00"),
            tax_rate=Decimal("10.00"),
        )
        self.cake = create_product(
            actor=self.admin,
            sku="CAK-01",
            name="Cake",
            category=cat,
            unit=unit,
            purchase_cost=Decimal("5.00"),
            selling_price=Decimal("20.00"),
            tax_rate=Decimal("0.00"),
        )
        record_opening_stock(actor=self.admin, product=self.latte, quantity=Decimal("50.000"))
        record_opening_stock(actor=self.admin, product=self.cake, quantity=Decimal("50.000"))

    def test_combined_per_item_cash_percent_and_all_items_percent_discount(self):
        self.client.force_authenticate(user=self.admin)

        # Latte: 2 x $10.00 = $20.00, item 10% discount = $2.00 -> $18.00 net
        # Cake: 1 x $20.00 = $20.00, item $4.00 cash discount = $4.00 -> $16.00 net
        # Subtotal = $40.00; item_discount_total = $6.00; after item discounts = $34.00
        # All-items discount: 10% of $34.00 = $3.40 (allocated: Latte $1.80, Cake $1.60)
        # Latte taxable = $18.00 - $1.80 = $16.20 -> 10% tax = $1.62 -> line_total = $17.82
        # Cake taxable = $16.00 - $1.60 = $14.40 -> 0% tax = $0.00 -> line_total = $14.40
        # Total discount = $6.00 + $3.40 = $9.40; Grand total = $40.00 - $9.40 + $1.62 = $32.22
        res = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {
                        "product": self.latte.id,
                        "quantity": "2",
                        "discount_type": "percent",
                        "discount_value": "10.00",
                    },
                    {
                        "product": self.cake.id,
                        "quantity": "1",
                        "discount_type": "fixed",
                        "discount_value": "4.00",
                    },
                ],
                "discount_type": "percent",
                "discount_value": "10.00",
                "payment_method": "cash",
                "paid_amount": "40.00",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["subtotal"], "40.00")
        self.assertEqual(res.data["item_discount_total"], "6.00")
        self.assertEqual(res.data["order_discount_type"], "percent")
        self.assertEqual(res.data["order_discount_value"], "10.00")
        self.assertEqual(res.data["order_discount_amount"], "3.40")
        self.assertEqual(res.data["discount_amount"], "9.40")
        self.assertEqual(res.data["tax_amount"], "1.62")
        self.assertEqual(res.data["total_amount"], "32.22")
        self.assertEqual(res.data["change_amount"], "7.78")

        items_by_sku = {i["product_sku_snapshot"]: i for i in res.data["items"]}
        self.assertEqual(items_by_sku["LAT-01"]["discount_type"], "percent")
        self.assertEqual(items_by_sku["LAT-01"]["discount_value"], "10.00")
        self.assertEqual(items_by_sku["LAT-01"]["line_discount"], "2.00")
        self.assertEqual(items_by_sku["LAT-01"]["line_tax"], "1.62")
        self.assertEqual(items_by_sku["LAT-01"]["line_total"], "17.82")

        self.assertEqual(items_by_sku["CAK-01"]["discount_type"], "fixed")
        self.assertEqual(items_by_sku["CAK-01"]["line_discount"], "4.00")
        self.assertEqual(items_by_sku["CAK-01"]["line_total"], "14.40")

    def test_item_discount_requires_sales_discount_permission_and_validates_bounds(self):
        # User without sales.discount cannot apply item discount -> 403
        self.client.force_authenticate(user=self.cashier_no_disc)
        res_403 = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {
                        "product": self.cake.id,
                        "quantity": "1",
                        "discount_type": "percent",
                        "discount_value": "5.00",
                    }
                ],
                "payment_method": "cash",
                "paid_amount": "20.00",
            },
            format="json",
        )
        self.assertEqual(res_403.status_code, status.HTTP_403_FORBIDDEN)

        # Percentage > 100% rejected -> 400
        self.client.force_authenticate(user=self.admin)
        res_bad_pct = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {
                        "product": self.cake.id,
                        "quantity": "1",
                        "discount_type": "percent",
                        "discount_value": "120.00",
                    }
                ],
                "payment_method": "cash",
                "paid_amount": "20.00",
            },
            format="json",
        )
        self.assertEqual(res_bad_pct.status_code, status.HTTP_400_BAD_REQUEST)

        # Fixed item discount > line subtotal rejected -> 400
        res_bad_cash = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {
                        "product": self.cake.id,
                        "quantity": "1",
                        "discount_type": "fixed",
                        "discount_value": "25.00",
                    }
                ],
                "payment_method": "cash",
                "paid_amount": "20.00",
            },
            format="json",
        )
        self.assertEqual(res_bad_cash.status_code, status.HTTP_400_BAD_REQUEST)
