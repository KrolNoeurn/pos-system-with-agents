"""Automated tests for POS Checkout, Sales History, Cancellation, Refunds, Customers, and RBAC."""

from decimal import Decimal
import io
import tempfile

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.catalog.models import Category, Product, Unit
from apps.inventory.models import StockBalance, StockMovement
from apps.inventory.services import record_opening_stock
from apps.rbac.models import Permission, Role
from apps.sales.models import Customer, Sale

User = get_user_model()


class SalesAndCheckoutAPITestCase(APITestCase):
    def setUp(self):
        call_command("seed_rbac")

        self.manager = self._create_user_with_role("sales_mgr", "manager")
        self.cashier = self._create_user_with_role("sales_cashier", "cashier")
        self.accountant = self._create_user_with_role("sales_acct", "accountant")
        self.clerk = self._create_user_with_role("sales_clerk", "inventory_clerk")

        # Custom cashier role WITHOUT sales.discount to test server-side discount enforcement
        no_discount_role = Role.objects.create(
            name="Basic Cashier",
            slug="basic_cashier",
            description="Can sell without discounts",
        )
        no_discount_role.permissions.set(
            Permission.objects.filter(code__in=["sales.view", "sales.create"])
        )
        self.basic_cashier = User.objects.create_user(
            username="basic_cashier",
            email="basic_cashier@example.com",
            password="Password123!",
            is_active=True,
        )
        self.basic_cashier.roles.add(no_discount_role)

        self.category = Category.objects.create(name="Beverages", slug="beverages")
        self.pcs_unit = Unit.objects.create(
            name="Piece", abbreviation="pcs", unit_type=Unit.UnitType.COUNT, allow_decimal=False
        )
        self.kg_unit = Unit.objects.create(
            name="Kilogram", abbreviation="kg", unit_type=Unit.UnitType.WEIGHT, allow_decimal=True
        )

        self.coffee = Product.objects.create(
            sku="POS-COF-01",
            barcode="8850001112223",
            name="Iced Coffee",
            category=self.category,
            unit=self.pcs_unit,
            purchase_cost=Decimal("1.50"),
            selling_price=Decimal("3.50"),
            tax_rate=Decimal("10.00"),
            min_stock_threshold=Decimal("5.000"),
            track_inventory=True,
        )
        self.beans = Product.objects.create(
            sku="POS-BEAN-01",
            barcode="8850001119999",
            name="Roasted Beans",
            category=self.category,
            unit=self.kg_unit,
            purchase_cost=Decimal("8.00"),
            selling_price=Decimal("16.00"),
            tax_rate=Decimal("0.00"),
            min_stock_threshold=Decimal("1.000"),
            track_inventory=True,
        )
        self.service_fee = Product.objects.create(
            sku="POS-BAG-01",
            name="Gift Wrapping",
            category=self.category,
            unit=self.pcs_unit,
            purchase_cost=Decimal("0.10"),
            selling_price=Decimal("1.00"),
            tax_rate=Decimal("0.00"),
            track_inventory=False,
        )

        # Seed initial stock through inventory service
        record_opening_stock(
            actor=self.manager,
            product=self.coffee,
            quantity=Decimal("10.000"),
            unit_cost=Decimal("1.50"),
        )
        record_opening_stock(
            actor=self.manager,
            product=self.beans,
            quantity=Decimal("5.000"),
            unit_cost=Decimal("8.00"),
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

    def test_checkout_recomputes_decimal_totals_deducts_stock_and_snapshots_items(self):
        self._auth(self.cashier)

        # Create customer first
        cust_res = self.client.post(
            "/api/v1/customers/",
            {"name": "Sokha Dara", "phone": "012888999"},
            format="json",
        )
        self.assertEqual(cust_res.status_code, status.HTTP_201_CREATED)
        customer_id = cust_res.data["id"]

        # Verify POS catalog search by barcode returns live stock availability
        cat_res = self.client.get("/api/v1/sales/catalog/?search=8850001112223")
        self.assertEqual(cat_res.status_code, status.HTTP_200_OK)
        self.assertEqual(cat_res.data["count"], 1)
        self.assertEqual(cat_res.data["results"][0]["stock_quantity"], "10.000")

        # Checkout with client trying to spoof a lower unit_price/total (must be ignored)
        # 2 x $3.50 (10% tax) = $7.00 subtotal; 0.5 kg x $16.00 (0% tax) = $8.00 subtotal
        # Combined subtotal = $15.00; discount = $1.50 -> allocated proportionally:
        # Coffee gets $1.50 * (7/15) = $0.70 -> taxable $6.30 -> 10% tax = $0.63
        # Beans gets remaining $0.80 -> 0% tax = $0.00
        # Grand total = 15.00 - 1.50 + 0.63 = $14.13; Cash tendered = $20.00 -> Change = $5.87
        checkout_res = self.client.post(
            "/api/v1/sales/",
            {
                "customer": customer_id,
                "items": [
                    {"product": self.coffee.id, "quantity": "2", "unit_price": "0.01"},
                    {"product": self.beans.id, "quantity": "0.500"},
                ],
                "discount_amount": "1.50",
                "payment_method": "cash",
                "paid_amount": "20.00",
                "idempotency_key": "pos-tx-001",
                "notes": "Morning order",
            },
            format="json",
        )
        self.assertEqual(checkout_res.status_code, status.HTTP_201_CREATED)
        sale_data = checkout_res.data
        self.assertEqual(sale_data["status"], "completed")
        self.assertEqual(sale_data["customer_name_snapshot"], "Sokha Dara")
        self.assertEqual(sale_data["subtotal"], "15.00")
        self.assertEqual(sale_data["discount_amount"], "1.50")
        self.assertEqual(sale_data["tax_amount"], "0.63")
        self.assertEqual(sale_data["total_amount"], "14.13")
        self.assertEqual(sale_data["paid_amount"], "20.00")
        self.assertEqual(sale_data["change_amount"], "5.87")
        self.assertEqual(len(sale_data["items"]), 2)
        self.assertEqual(sale_data["items"][0]["unit_price"], "3.50")
        self.assertEqual(sale_data["items"][0]["unit_cost_snapshot"], "1.50")

        # Verify stock deducted via inventory service
        coffee_bal = StockBalance.objects.get(product=self.coffee)
        beans_bal = StockBalance.objects.get(product=self.beans)
        self.assertEqual(coffee_bal.quantity_on_hand, Decimal("8.000"))
        self.assertEqual(beans_bal.quantity_on_hand, Decimal("4.500"))
        self.assertTrue(
            StockMovement.objects.filter(
                product=self.coffee,
                movement_type=StockMovement.MovementType.SALE,
                reference_code=sale_data["sale_number"],
                quantity_delta=Decimal("-2.000"),
            ).exists()
        )

        # Verify idempotent replay returns same sale without deducting stock again
        replay_res = self.client.post(
            "/api/v1/sales/",
            {
                "customer": customer_id,
                "items": [{"product": self.coffee.id, "quantity": "2"}],
                "discount_amount": "1.50",
                "payment_method": "cash",
                "paid_amount": "20.00",
                "idempotency_key": "pos-tx-001",
            },
            format="json",
        )
        self.assertEqual(replay_res.status_code, status.HTTP_200_OK)
        self.assertEqual(replay_res.data["id"], sale_data["id"])
        coffee_bal.refresh_from_db()
        self.assertEqual(coffee_bal.quantity_on_hand, Decimal("8.000"))

        # Verify audit events recorded for sale and discount
        self.assertTrue(AuditLog.objects.filter(action="sale.completed", target_id=sale_data["id"]).exists())
        self.assertTrue(
            AuditLog.objects.filter(action="sale.discount_applied", target_id=sale_data["id"]).exists()
        )

        # Completed sales cannot be deleted or edited directly
        sale_url = f"/api/v1/sales/{sale_data['id']}/"
        self.assertIn(self.client.delete(sale_url).status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))
        self.assertIn(
            self.client.patch(sale_url, {"notes": "tampered"}, format="json").status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED),
        )
        self.assertTrue(Sale.objects.filter(pk=sale_data["id"]).exists())

        # Product used in a sale is protected from deletion (409 Conflict)
        self._auth(self.manager)
        del_prod = self.client.delete(f"/api/v1/products/{self.coffee.id}/")
        self.assertEqual(del_prod.status_code, status.HTTP_409_CONFLICT)

    def test_insufficient_stock_rolls_back_entire_sale_atomically(self):
        self._auth(self.cashier)

        # First item (coffee x 2) is in stock, second item (beans x 99) exceeds stock (5.000)
        res = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {"product": self.coffee.id, "quantity": "2"},
                    {"product": self.beans.id, "quantity": "99"},
                ],
                "payment_method": "cash",
                "paid_amount": "2000.00",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        # No sale created and coffee stock was NOT partially deducted
        self.assertEqual(Sale.objects.count(), 0)
        self.assertEqual(
            StockBalance.objects.get(product=self.coffee).quantity_on_hand,
            Decimal("10.000"),
        )
        self.assertEqual(
            StockMovement.objects.filter(movement_type=StockMovement.MovementType.SALE).count(),
            0,
        )

    def test_cancel_and_refund_restore_stock_once_and_block_duplicates(self):
        self._auth(self.manager)

        # Sale 1 -> Cancel (Void)
        sale1_res = self.client.post(
            "/api/v1/sales/",
            {
                "items": [{"product": self.coffee.id, "quantity": "3"}],
                "payment_method": "qr",
                "paid_amount": "11.55",
                "payment_reference": "KHQR-991",
            },
            format="json",
        )
        self.assertEqual(sale1_res.status_code, status.HTTP_201_CREATED)
        sale1_id = sale1_res.data["id"]
        self.assertEqual(
            StockBalance.objects.get(product=self.coffee).quantity_on_hand,
            Decimal("7.000"),
        )

        # Missing reason rejected
        bad_cancel = self.client.post(f"/api/v1/sales/{sale1_id}/cancel/", {"reason": "  "}, format="json")
        self.assertEqual(bad_cancel.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid cancel restores stock via VOID movement
        cancel_res = self.client.post(
            f"/api/v1/sales/{sale1_id}/cancel/",
            {"reason": "Customer changed mind"},
            format="json",
        )
        self.assertEqual(cancel_res.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_res.data["status"], "cancelled")
        self.assertEqual(
            StockBalance.objects.get(product=self.coffee).quantity_on_hand,
            Decimal("10.000"),
        )
        self.assertTrue(
            StockMovement.objects.filter(
                product=self.coffee,
                movement_type=StockMovement.MovementType.VOID,
                quantity_delta=Decimal("3.000"),
            ).exists()
        )

        # Duplicate cancel & refunding a cancelled sale both return 409 Conflict
        dup_cancel = self.client.post(
            f"/api/v1/sales/{sale1_id}/cancel/", {"reason": "Second attempt"}, format="json"
        )
        self.assertEqual(dup_cancel.status_code, status.HTTP_409_CONFLICT)
        refund_after_cancel = self.client.post(
            f"/api/v1/sales/{sale1_id}/refund/", {"reason": "Try refund"}, format="json"
        )
        self.assertEqual(refund_after_cancel.status_code, status.HTTP_409_CONFLICT)

        # Sale 2 -> Split payment + Refund
        sale2_res = self.client.post(
            "/api/v1/sales/",
            {
                "items": [
                    {"product": self.coffee.id, "quantity": "2"},
                    {"product": self.service_fee.id, "quantity": "1"},
                ],
                "payments": [
                    {"payment_method": "card", "amount": "5.00", "reference_code": "VISA-1234"},
                    {"payment_method": "cash", "amount": "5.00"},
                ],
            },
            format="json",
        )
        self.assertEqual(sale2_res.status_code, status.HTTP_201_CREATED)
        sale2_id = sale2_res.data["id"]
        # Coffee 2x3.50=7.00 + 10% tax 0.70 = 7.70 + Gift 1.00 = 8.70; Paid 10.00 -> Change 1.30
        self.assertEqual(sale2_res.data["payment_method"], "split")
        self.assertEqual(sale2_res.data["total_amount"], "8.70")
        self.assertEqual(sale2_res.data["change_amount"], "1.30")
        self.assertEqual(
            StockBalance.objects.get(product=self.coffee).quantity_on_hand,
            Decimal("8.000"),
        )

        refund_res = self.client.post(
            f"/api/v1/sales/{sale2_id}/refund/",
            {"reason": "Damaged packaging"},
            format="json",
        )
        self.assertEqual(refund_res.status_code, status.HTTP_200_OK)
        self.assertEqual(refund_res.data["status"], "refunded")
        self.assertEqual(
            StockBalance.objects.get(product=self.coffee).quantity_on_hand,
            Decimal("10.000"),
        )
        self.assertTrue(
            StockMovement.objects.filter(
                product=self.coffee,
                movement_type=StockMovement.MovementType.REFUND,
                quantity_delta=Decimal("2.000"),
            ).exists()
        )

        # Duplicate refund blocked with 409
        dup_refund = self.client.post(
            f"/api/v1/sales/{sale2_id}/refund/", {"reason": "Retry"}, format="json"
        )
        self.assertEqual(dup_refund.status_code, status.HTTP_409_CONFLICT)

    def test_validation_and_rbac_permissions_across_roles(self):
        # Unauthenticated rejected
        self.assertEqual(self.client.get("/api/v1/sales/").status_code, status.HTTP_401_UNAUTHORIZED)

        # Inventory clerk has no sales permissions
        self._auth(self.clerk)
        self.assertEqual(self.client.get("/api/v1/sales/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post("/api/v1/sales/", {}, format="json").status_code, status.HTTP_403_FORBIDDEN)

        # Accountant can view sales but cannot create
        self._auth(self.accountant)
        self.assertEqual(self.client.get("/api/v1/sales/").status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(
                "/api/v1/sales/",
                {"items": [{"product": self.coffee.id, "quantity": "1"}], "paid_amount": "5.00"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        # Basic cashier without sales.discount gets 403 when trying to apply discount
        self._auth(self.basic_cashier)
        disc_res = self.client.post(
            "/api/v1/sales/",
            {
                "items": [{"product": self.coffee.id, "quantity": "1"}],
                "discount_amount": "0.50",
                "payment_method": "cash",
                "paid_amount": "5.00",
            },
            format="json",
        )
        self.assertEqual(disc_res.status_code, status.HTTP_403_FORBIDDEN)

        # Validation: decimal quantity on non-decimal unit, underpayment, non-cash overpayment, duplicate product
        self._auth(self.cashier)
        self.assertEqual(
            self.client.post(
                "/api/v1/sales/",
                {"items": [{"product": self.coffee.id, "quantity": "1.5"}], "paid_amount": "10.00"},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/sales/",
                {"items": [{"product": self.coffee.id, "quantity": "1"}], "paid_amount": "1.00"},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/sales/",
                {
                    "items": [{"product": self.coffee.id, "quantity": "1"}],
                    "payment_method": "card",
                    "paid_amount": "10.00",
                },
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/sales/",
                {
                    "items": [
                        {"product": self.coffee.id, "quantity": "1"},
                        {"product": self.coffee.id, "quantity": "1"},
                    ],
                    "paid_amount": "20.00",
                },
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Cashier creates a sale, then attempts cancel/refund -> 403 Forbidden
        created = self.client.post(
            "/api/v1/sales/",
            {"items": [{"product": self.coffee.id, "quantity": "1"}], "paid_amount": "5.00"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        sale_id = created.data["id"]

        self.assertEqual(
            self.client.post(
                f"/api/v1/sales/{sale_id}/cancel/", {"reason": "Unauthorized"}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/sales/{sale_id}/refund/", {"reason": "Unauthorized"}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def _make_test_image(self, name: str = "customer.png") -> SimpleUploadedFile:
        buf = io.BytesIO()
        Image.new("RGB", (64, 64), color=(40, 199, 111)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

    def test_customer_profile_avatar_upload_remove_and_default_null(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                self._auth(self.manager)

                # 1. Customer created without avatar returns null avatar_url (frontend renders default avatar)
                created = self.client.post(
                    "/api/v1/customers/",
                    {"name": "Default Avatar Client", "phone": "012888999"},
                    format="json",
                )
                self.assertEqual(created.status_code, status.HTTP_201_CREATED)
                self.assertIsNone(created.data["avatar_url"])
                self.assertTrue(created.data["is_active"])
                cust_id = created.data["id"]

                # 2. Upload avatar via multipart PATCH while preserving is_active=True
                patched = self.client.patch(
                    f"/api/v1/customers/{cust_id}/",
                    {"avatar": self._make_test_image("client1.png")},
                    format="multipart",
                )
                self.assertEqual(patched.status_code, status.HTTP_200_OK)
                self.assertTrue(patched.data["is_active"])
                self.assertIsNotNone(patched.data["avatar_url"])
                self.assertIn("customers/avatars/", patched.data["avatar_url"])

                # 3. Checkout sale for this customer exposes customer_avatar_url
                sale_resp = self.client.post(
                    "/api/v1/sales/",
                    {
                        "customer": cust_id,
                        "items": [{"product": self.coffee.id, "quantity": "1"}],
                        "paid_amount": "5.00",
                    },
                    format="json",
                )
                self.assertEqual(sale_resp.status_code, status.HTTP_201_CREATED)
                self.assertEqual(sale_resp.data["customer_avatar_url"], patched.data["avatar_url"])

                # 4. Remove avatar returns customer to default avatar (avatar_url=None)
                removed = self.client.patch(
                    f"/api/v1/customers/{cust_id}/",
                    {"remove_avatar": True},
                    format="json",
                )
                self.assertEqual(removed.status_code, status.HTTP_200_OK)
                self.assertIsNone(removed.data["avatar_url"])

                # 5. Create customer directly with avatar via multipart POST
                created_with_avatar = self.client.post(
                    "/api/v1/customers/",
                    {
                        "name": "Photo Client",
                        "phone": "012777666",
                        "avatar": self._make_test_image("client2.png"),
                    },
                    format="multipart",
                )
                self.assertEqual(created_with_avatar.status_code, status.HTTP_201_CREATED)
                self.assertTrue(created_with_avatar.data["is_active"])
                self.assertIsNotNone(created_with_avatar.data["avatar_url"])

                # 6. Invalid non-image file rejected
                bad_file = SimpleUploadedFile("bad.txt", b"not-an-image", content_type="text/plain")
                bad_resp = self.client.patch(
                    f"/api/v1/customers/{cust_id}/",
                    {"avatar": bad_file},
                    format="multipart",
                )
                self.assertEqual(bad_resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_checkout_cors_preflight_allows_idempotency_key_header(self):
        resp = self.client.options(
            "/api/v1/sales/",
            HTTP_ORIGIN="http://localhost:5173",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type,x-idempotency-key",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.get("Access-Control-Allow-Origin"), "http://localhost:5173")
        allow_headers = (resp.get("Access-Control-Allow-Headers") or "").lower()
        self.assertIn("x-idempotency-key", allow_headers)
        self.assertIn("authorization", allow_headers)
        self.assertIn("content-type", allow_headers)
