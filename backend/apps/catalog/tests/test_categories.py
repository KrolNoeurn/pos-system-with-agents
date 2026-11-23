"""Automated tests for Category CRUD, search, pagination, validation, delete protection, and RBAC."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db.models.deletion import ProtectedError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.catalog.models import Category
from apps.rbac.models import Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


class CategoryAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        sync_default_rbac()
        cls.manager_role = Role.objects.get(slug="manager")
        cls.cashier_role = Role.objects.get(slug="cashier")
        cls.clerk_role = Role.objects.get(slug="inventory_clerk")

        cls.manager = User.objects.create_user(
            username="cat_manager",
            email="cat_manager@pos.local",
            password="ManagerPass!2026",
            full_name="Catalog Manager",
        )
        cls.manager.roles.add(cls.manager_role)

        cls.cashier = User.objects.create_user(
            username="cat_cashier",
            email="cat_cashier@pos.local",
            password="CashierPass!2026",
            full_name="Catalog Cashier",
        )
        cls.cashier.roles.add(cls.cashier_role)

        cls.clerk = User.objects.create_user(
            username="cat_clerk",
            email="cat_clerk@pos.local",
            password="ClerkPass!2026",
            full_name="Inventory Clerk",
        )
        cls.clerk.roles.add(cls.clerk_role)

        cls.no_role_user = User.objects.create_user(
            username="cat_norole",
            email="cat_norole@pos.local",
            password="NoRolePass!2026",
            full_name="Unassigned User",
        )

    def setUp(self) -> None:
        self.list_url = reverse("category-list")

    def _auth_user(self, user: User) -> None:
        self.client.force_authenticate(user=user)

    def test_unauthenticated_requests_return_401(self) -> None:
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            self.client.post(self.list_url, {"name": "Beverages"}, format="json").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_user_without_products_view_gets_403(self) -> None:
        self._auth_user(self.no_role_user)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_can_view_but_cannot_create_edit_or_delete_categories(self) -> None:
        cat = Category.objects.create(name="Drinks", slug="drinks")
        self._auth_user(self.cashier)

        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(self.list_url, {"name": "Snacks"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.patch(
                reverse("category-detail", kwargs={"pk": cat.id}),
                {"name": "Cold Drinks"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(reverse("category-deactivate", kwargs={"pk": cat.id})).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(reverse("category-detail", kwargs={"pk": cat.id})).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_inventory_clerk_can_create_and_edit_but_cannot_delete(self) -> None:
        self._auth_user(self.clerk)
        create_resp = self.client.post(
            self.list_url,
            {"name": "Dairy", "name_km": "ផលិតផលទឹកដោះគោ"},
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        cat_id = create_resp.data["id"]

        patch_resp = self.client.patch(
            reverse("category-detail", kwargs={"pk": cat_id}),
            {"description": "Chilled dairy products"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)

        del_resp = self.client.delete(reverse("category-detail", kwargs={"pk": cat_id}))
        self.assertEqual(del_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_full_crud_activate_deactivate_and_audit(self) -> None:
        self._auth_user(self.manager)

        # Create
        created = self.client.post(
            self.list_url,
            {
                "name": "Beverages",
                "name_km": "ភេសជ្ជៈ",
                "description": "Soft drinks and bottled water",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        cat_id = created.data["id"]
        self.assertEqual(created.data["slug"], "beverages")
        self.assertTrue(created.data["is_active"])
        self.assertTrue(AuditLog.objects.filter(action="category.created", target_id=str(cat_id)).exists())

        # Edit
        updated = self.client.patch(
            reverse("category-detail", kwargs={"pk": cat_id}),
            {"name": "Cold Beverages", "name_km": "ភេសជ្ជៈត្រជាក់"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["name"], "Cold Beverages")
        self.assertEqual(updated.data["name_km"], "ភេសជ្ជៈត្រជាក់")

        # Deactivate & Activate
        deact = self.client.post(reverse("category-deactivate", kwargs={"pk": cat_id}))
        self.assertEqual(deact.status_code, status.HTTP_200_OK)
        self.assertFalse(deact.data["is_active"])

        act = self.client.post(reverse("category-activate", kwargs={"pk": cat_id}))
        self.assertEqual(act.status_code, status.HTTP_200_OK)
        self.assertTrue(act.data["is_active"])

        # Delete unused category
        deleted = self.client.delete(reverse("category-detail", kwargs={"pk": cat_id}))
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Category.objects.filter(pk=cat_id).exists())
        self.assertTrue(AuditLog.objects.filter(action="category.deleted", target_id=str(cat_id)).exists())

    def test_validation_duplicate_name_blank_name_and_hierarchy_cycles(self) -> None:
        self._auth_user(self.manager)
        parent = Category.objects.create(name="Food", slug="food")
        child = Category.objects.create(name="Bakery", slug="bakery", parent=parent)

        # Case-insensitive duplicate rejected
        dup = self.client.post(self.list_url, {"name": "food"}, format="json")
        self.assertEqual(dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", dup.data)

        # Whitespace-only name rejected
        blank = self.client.post(self.list_url, {"name": "   "}, format="json")
        self.assertEqual(blank.status_code, status.HTTP_400_BAD_REQUEST)

        # Self-parent rejected
        self_parent = self.client.patch(
            reverse("category-detail", kwargs={"pk": parent.id}),
            {"parent": parent.id},
            format="json",
        )
        self.assertEqual(self_parent.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("parent", self_parent.data)

        # Indirect cycle (parent -> child -> parent) rejected
        cycle = self.client.patch(
            reverse("category-detail", kwargs={"pk": parent.id}),
            {"parent": child.id},
            format="json",
        )
        self.assertEqual(cycle.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("parent", cycle.data)

    def test_delete_protection_blocks_category_in_use_by_children_or_protected_records(self) -> None:
        self._auth_user(self.manager)
        parent = Category.objects.create(name="Electronics", slug="electronics")
        child = Category.objects.create(name="Cables", slug="cables", parent=parent)

        # Deleting parent with subcategories returns 409 Conflict
        resp_parent = self.client.delete(reverse("category-detail", kwargs={"pk": parent.id}))
        self.assertEqual(resp_parent.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Category.objects.filter(pk=parent.id).exists())

        # Deleting a category referenced by a PROTECT FK (e.g., future Product) returns 409 Conflict
        with patch.object(
            Category,
            "delete",
            side_effect=ProtectedError("Referenced by products", set()),
        ):
            resp_protected = self.client.delete(reverse("category-detail", kwargs={"pk": child.id}))
        self.assertEqual(resp_protected.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Category.objects.filter(pk=child.id).exists())

    def test_search_status_filter_and_pagination(self) -> None:
        self._auth_user(self.manager)
        Category.objects.create(name="Coffee", name_km="កាហ្វេ", slug="coffee", is_active=True)
        Category.objects.create(name="Tea", name_km="តែ", slug="tea", is_active=True)
        Category.objects.create(name="Archived Items", slug="archived-items", is_active=False)

        # Pagination
        page1 = self.client.get(f"{self.list_url}?page=1&page_size=2")
        self.assertEqual(page1.status_code, status.HTTP_200_OK)
        self.assertEqual(page1.data["count"], 3)
        self.assertEqual(len(page1.data["results"]), 2)
        self.assertIsNotNone(page1.data["next"])

        page2 = self.client.get(f"{self.list_url}?page=2&page_size=2")
        self.assertEqual(page2.status_code, status.HTTP_200_OK)
        self.assertEqual(len(page2.data["results"]), 1)

        # Search by Khmer name
        km_search = self.client.get(f"{self.list_url}?search=កាហ្វេ")
        self.assertEqual(km_search.status_code, status.HTTP_200_OK)
        self.assertEqual(km_search.data["count"], 1)
        self.assertEqual(km_search.data["results"][0]["slug"], "coffee")

        # Filter by active status
        inactive = self.client.get(f"{self.list_url}?is_active=false")
        self.assertEqual(inactive.status_code, status.HTTP_200_OK)
        self.assertEqual(inactive.data["count"], 1)
        self.assertEqual(inactive.data["results"][0]["slug"], "archived-items")
