"""Automated tests for Products CRUD, image upload, Decimal validation, search/filter/sort, delete protection, and RBAC."""

from decimal import Decimal
import io
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models.deletion import ProtectedError
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.catalog.models import Category, Product, Unit
from apps.rbac.models import Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


def _make_test_png(name: str = "sample.png") -> SimpleUploadedFile:
    buf = io.BytesIO()
    img = Image.new("RGB", (32, 32), color=(40, 120, 220))
    img.save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type="image/png")


class ProductAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        sync_default_rbac()
        cls.manager_role = Role.objects.get(slug="manager")
        cls.cashier_role = Role.objects.get(slug="cashier")
        cls.clerk_role = Role.objects.get(slug="inventory_clerk")

        cls.manager = User.objects.create_user(
            username="prod_manager",
            email="prod_manager@pos.local",
            password="ManagerPass!2026",
        )
        cls.manager.roles.add(cls.manager_role)

        cls.cashier = User.objects.create_user(
            username="prod_cashier",
            email="prod_cashier@pos.local",
            password="CashierPass!2026",
        )
        cls.cashier.roles.add(cls.cashier_role)

        cls.clerk = User.objects.create_user(
            username="prod_clerk",
            email="prod_clerk@pos.local",
            password="ClerkPass!2026",
        )
        cls.clerk.roles.add(cls.clerk_role)

        cls.no_role_user = User.objects.create_user(
            username="prod_norole",
            email="prod_norole@pos.local",
            password="NoRolePass!2026",
        )

        cls.beverages = Category.objects.create(name="Beverages", name_km="ភេសជ្ជៈ", slug="beverages")
        cls.snacks = Category.objects.create(name="Snacks", name_km="អាហារសម្រន់", slug="snacks")
        cls.piece = Unit.objects.create(name="Piece", name_km="ដុំ", abbreviation="pcs", unit_type="count")
        cls.bottle = Unit.objects.create(name="Bottle", name_km="ដប", abbreviation="btl", unit_type="volume")

    def setUp(self) -> None:
        self.list_url = reverse("product-list")

    def _auth_user(self, user: User) -> None:
        self.client.force_authenticate(user=user)

    def test_unauthenticated_and_unauthorized_access(self) -> None:
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_401_UNAUTHORIZED)

        self._auth_user(self.no_role_user)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_read_only_and_clerk_price_edit_permission_guard(self) -> None:
        product = Product.objects.create(
            sku="DRK-001",
            barcode="885000100001",
            name="Iced Tea",
            category=self.beverages,
            unit=self.bottle,
            purchase_cost=Decimal("0.60"),
            selling_price=Decimal("1.25"),
        )
        detail_url = reverse("product-detail", kwargs={"pk": product.id})

        # Cashier: view only
        self._auth_user(self.cashier)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(detail_url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.patch(detail_url, {"description": "New"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(self.client.delete(detail_url).status_code, status.HTTP_403_FORBIDDEN)

        # Inventory clerk: can edit non-price fields, blocked on price change (lacks products.edit_price) and delete
        self._auth_user(self.clerk)
        ok_edit = self.client.patch(detail_url, {"description": "Updated desc"}, format="json")
        self.assertEqual(ok_edit.status_code, status.HTTP_200_OK)

        blocked_price = self.client.patch(detail_url, {"selling_price": "2.00"}, format="json")
        self.assertEqual(blocked_price.status_code, status.HTTP_403_FORBIDDEN)

        blocked_del = self.client.delete(detail_url)
        self.assertEqual(blocked_del.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_full_crud_image_upload_decimal_precision_and_price_audit(self) -> None:
        self._auth_user(self.manager)

        with tempfile.TemporaryDirectory() as media_dir:
            with override_settings(MEDIA_ROOT=media_dir):
                created = self.client.post(
                    self.list_url,
                    {
                        "sku": "COF-100",
                        "barcode": "885999111222",
                        "name": "Arabica Coffee",
                        "name_km": "កាហ្វេអារ៉ាប៊ីកា",
                        "description": "Roasted beans 250g",
                        "category": self.beverages.id,
                        "unit": self.piece.id,
                        "purchase_cost": "4.50",
                        "selling_price": "7.95",
                        "wholesale_price": "6.50",
                        "min_stock_threshold": "5.000",
                        "image": _make_test_png("coffee.png"),
                    },
                    format="multipart",
                )
                self.assertEqual(created.status_code, status.HTTP_201_CREATED)
                prod_id = created.data["id"]
                self.assertEqual(created.data["purchase_cost"], "4.50")
                self.assertEqual(created.data["selling_price"], "7.95")
                self.assertEqual(created.data["wholesale_price"], "6.50")
                self.assertEqual(created.data["min_stock_threshold"], "5.000")
                self.assertIsNotNone(created.data["image_url"])
                self.assertNotIn("stock_quantity", created.data)

                # Update price & verify dedicated price_changed audit log
                detail_url = reverse("product-detail", kwargs={"pk": prod_id})
                updated = self.client.patch(
                    detail_url,
                    {"selling_price": "8.25", "remove_image": True},
                    format="json",
                )
                self.assertEqual(updated.status_code, status.HTTP_200_OK)
                self.assertEqual(updated.data["selling_price"], "8.25")
                self.assertIsNone(updated.data["image_url"])
                self.assertTrue(
                    AuditLog.objects.filter(action="product.price_changed", target_id=str(prod_id)).exists()
                )

                # Deactivate & Activate
                deact = self.client.post(reverse("product-deactivate", kwargs={"pk": prod_id}))
                self.assertEqual(deact.status_code, status.HTTP_200_OK)
                self.assertFalse(deact.data["is_active"])

                act = self.client.post(reverse("product-activate", kwargs={"pk": prod_id}))
                self.assertEqual(act.status_code, status.HTTP_200_OK)
                self.assertTrue(act.data["is_active"])

                # Delete unused product succeeds
                deleted = self.client.delete(detail_url)
                self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
                self.assertFalse(Product.objects.filter(pk=prod_id).exists())

    def test_validation_unique_sku_unique_barcode_and_monetary_bounds(self) -> None:
        self._auth_user(self.manager)
        Product.objects.create(
            sku="SKU-UNIQ",
            barcode="BC-12345",
            name="First Product",
            category=self.beverages,
            unit=self.piece,
            purchase_cost=Decimal("1.00"),
            selling_price=Decimal("2.00"),
        )

        # Duplicate SKU (case-insensitive) rejected
        dup_sku = self.client.post(
            self.list_url,
            {
                "sku": "sku-uniq",
                "name": "Other",
                "category": self.beverages.id,
                "unit": self.piece.id,
                "selling_price": "3.00",
            },
            format="json",
        )
        self.assertEqual(dup_sku.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sku", dup_sku.data)

        # Duplicate barcode (case-insensitive) rejected
        dup_bc = self.client.post(
            self.list_url,
            {
                "sku": "SKU-002",
                "barcode": "bc-12345",
                "name": "Other",
                "category": self.beverages.id,
                "unit": self.piece.id,
                "selling_price": "3.00",
            },
            format="json",
        )
        self.assertEqual(dup_bc.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("barcode", dup_bc.data)

        # Multiple products with blank/null barcode are allowed
        for idx in (3, 4):
            ok_no_bc = self.client.post(
                self.list_url,
                {
                    "sku": f"SKU-NOBC-{idx}",
                    "barcode": "",
                    "name": f"No Barcode {idx}",
                    "category": self.beverages.id,
                    "unit": self.piece.id,
                    "selling_price": "1.50",
                },
                format="json",
            )
            self.assertEqual(ok_no_bc.status_code, status.HTTP_201_CREATED)
            self.assertIsNone(ok_no_bc.data["barcode"])

        # Negative prices and negative threshold rejected
        for field, val in (
            ("purchase_cost", "-1.00"),
            ("selling_price", "-0.01"),
            ("wholesale_price", "-5.00"),
            ("min_stock_threshold", "-2.000"),
        ):
            payload = {
                "sku": f"SKU-NEG-{field}",
                "name": "Invalid Price",
                "category": self.beverages.id,
                "unit": self.piece.id,
                "selling_price": "2.00",
            }
            payload[field] = val
            resp = self.client.post(self.list_url, payload, format="json")
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, f"Expected 400 for {field}={val}")

    def test_delete_protection_for_product_and_real_category_unit_in_use_protection(self) -> None:
        self._auth_user(self.manager)
        product = Product.objects.create(
            sku="PROT-001",
            name="Protected Product",
            category=self.beverages,
            unit=self.bottle,
            purchase_cost=Decimal("2.00"),
            selling_price=Decimal("4.00"),
        )

        # Real DB PROTECT prevents deleting Category or Unit while Product references them
        cat_del = self.client.delete(reverse("category-detail", kwargs={"pk": self.beverages.id}))
        self.assertEqual(cat_del.status_code, status.HTTP_409_CONFLICT)

        unit_del = self.client.delete(reverse("unit-detail", kwargs={"pk": self.bottle.id}))
        self.assertEqual(unit_del.status_code, status.HTTP_409_CONFLICT)

        # Product referenced by historical transaction (ProtectedError) returns 409 Conflict
        with patch.object(
            Product,
            "delete",
            side_effect=ProtectedError("Referenced by sale_items", set()),
        ):
            prod_del = self.client.delete(reverse("product-detail", kwargs={"pk": product.id}))
        self.assertEqual(prod_del.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Product.objects.filter(pk=product.id).exists())

    def test_search_filter_sorting_and_pagination(self) -> None:
        self._auth_user(self.manager)
        Product.objects.create(
            sku="A-001",
            barcode="111111",
            name="Mineral Water",
            name_km="ទឹកបរិសុទ្ធ",
            category=self.beverages,
            unit=self.bottle,
            purchase_cost=Decimal("0.20"),
            selling_price=Decimal("0.50"),
            is_active=True,
        )
        Product.objects.create(
            sku="B-002",
            barcode="222222",
            name="Potato Chips",
            name_km="ដំឡូងបំពង",
            category=self.snacks,
            unit=self.piece,
            purchase_cost=Decimal("1.00"),
            selling_price=Decimal("2.50"),
            is_active=True,
        )
        Product.objects.create(
            sku="C-003",
            barcode="333333",
            name="Old Soda",
            category=self.beverages,
            unit=self.bottle,
            purchase_cost=Decimal("0.50"),
            selling_price=Decimal("1.20"),
            is_active=False,
        )

        # Pagination
        p1 = self.client.get(f"{self.list_url}?page=1&page_size=2")
        self.assertEqual(p1.status_code, status.HTTP_200_OK)
        self.assertEqual(p1.data["count"], 3)
        self.assertEqual(len(p1.data["results"]), 2)

        # Sorting descending by selling_price
        sorted_desc = self.client.get(f"{self.list_url}?ordering=-selling_price")
        prices = [Decimal(row["selling_price"]) for row in sorted_desc.data["results"]]
        self.assertEqual(prices, [Decimal("2.50"), Decimal("1.20"), Decimal("0.50")])

        # Search by Khmer name and barcode
        km_search = self.client.get(f"{self.list_url}?search=ទឹកបរិសុទ្ធ")
        self.assertEqual(km_search.data["count"], 1)
        self.assertEqual(km_search.data["results"][0]["sku"], "A-001")

        bc_search = self.client.get(f"{self.list_url}?search=222222")
        self.assertEqual(bc_search.data["count"], 1)
        self.assertEqual(bc_search.data["results"][0]["sku"], "B-002")

        # Filter by category & active status
        filtered = self.client.get(f"{self.list_url}?category={self.beverages.id}&is_active=true")
        self.assertEqual(filtered.data["count"], 1)
        self.assertEqual(filtered.data["results"][0]["sku"], "A-001")
