"""Automated tests for Units CRUD, conversion validation, search, pagination, delete protection, and RBAC."""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db.models.deletion import ProtectedError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.catalog.models import Unit
from apps.rbac.models import Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


class UnitAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        sync_default_rbac()
        cls.manager_role = Role.objects.get(slug="manager")
        cls.cashier_role = Role.objects.get(slug="cashier")
        cls.clerk_role = Role.objects.get(slug="inventory_clerk")

        cls.manager = User.objects.create_user(
            username="unit_manager",
            email="unit_manager@pos.local",
            password="ManagerPass!2026",
            full_name="Unit Manager",
        )
        cls.manager.roles.add(cls.manager_role)

        cls.cashier = User.objects.create_user(
            username="unit_cashier",
            email="unit_cashier@pos.local",
            password="CashierPass!2026",
            full_name="Unit Cashier",
        )
        cls.cashier.roles.add(cls.cashier_role)

        cls.clerk = User.objects.create_user(
            username="unit_clerk",
            email="unit_clerk@pos.local",
            password="ClerkPass!2026",
            full_name="Unit Clerk",
        )
        cls.clerk.roles.add(cls.clerk_role)

        cls.no_role_user = User.objects.create_user(
            username="unit_norole",
            email="unit_norole@pos.local",
            password="NoRolePass!2026",
            full_name="No Role User",
        )

    def setUp(self) -> None:
        self.list_url = reverse("unit-list")

    def _auth_user(self, user: User) -> None:
        self.client.force_authenticate(user=user)

    def test_unauthenticated_and_unauthorized_access(self) -> None:
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_401_UNAUTHORIZED)

        self._auth_user(self.no_role_user)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_read_only_and_clerk_cannot_delete(self) -> None:
        piece = Unit.objects.create(name="Piece", abbreviation="pcs", unit_type="count")

        self._auth_user(self.cashier)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(
                self.list_url,
                {"name": "Pack", "abbreviation": "pk", "unit_type": "count"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(reverse("unit-detail", kwargs={"pk": piece.id})).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self._auth_user(self.clerk)
        created = self.client.post(
            self.list_url,
            {"name": "Pack", "abbreviation": "pk", "unit_type": "count"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            self.client.delete(reverse("unit-detail", kwargs={"pk": created.data["id"]})).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_manager_full_crud_extensible_conversion_and_audit(self) -> None:
        self._auth_user(self.manager)

        # Create base unit
        gram_resp = self.client.post(
            self.list_url,
            {
                "name": "Gram",
                "name_km": "ក្រាម",
                "abbreviation": "g",
                "unit_type": "weight",
                "allow_decimal": True,
            },
            format="json",
        )
        self.assertEqual(gram_resp.status_code, status.HTTP_201_CREATED)
        gram_id = gram_resp.data["id"]
        self.assertEqual(Decimal(gram_resp.data["conversion_factor"]), Decimal("1.000000"))

        # Create derived unit referencing base unit
        kg_resp = self.client.post(
            self.list_url,
            {
                "name": "Kilogram",
                "name_km": "គីឡូក្រាម",
                "abbreviation": "kg",
                "unit_type": "weight",
                "allow_decimal": True,
                "base_unit": gram_id,
                "conversion_factor": "1000.000000",
            },
            format="json",
        )
        self.assertEqual(kg_resp.status_code, status.HTTP_201_CREATED)
        kg_id = kg_resp.data["id"]
        self.assertEqual(kg_resp.data["base_unit"], gram_id)
        self.assertEqual(kg_resp.data["base_unit_abbreviation"], "g")
        self.assertTrue(AuditLog.objects.filter(action="unit.created", target_id=str(kg_id)).exists())

        # Edit
        edit_resp = self.client.patch(
            reverse("unit-detail", kwargs={"pk": kg_id}),
            {"name": "Kilogram (Metric)"},
            format="json",
        )
        self.assertEqual(edit_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(edit_resp.data["name"], "Kilogram (Metric)")

        # Deactivate & Activate
        deact = self.client.post(reverse("unit-deactivate", kwargs={"pk": kg_id}))
        self.assertEqual(deact.status_code, status.HTTP_200_OK)
        self.assertFalse(deact.data["is_active"])

        act = self.client.post(reverse("unit-activate", kwargs={"pk": kg_id}))
        self.assertEqual(act.status_code, status.HTTP_200_OK)
        self.assertTrue(act.data["is_active"])

        # Delete unused derived unit succeeds
        deleted = self.client.delete(reverse("unit-detail", kwargs={"pk": kg_id}))
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(AuditLog.objects.filter(action="unit.deleted", target_id=str(kg_id)).exists())

    def test_validation_duplicates_conversion_factor_and_cross_type_base_unit(self) -> None:
        self._auth_user(self.manager)
        gram = Unit.objects.create(name="Gram", abbreviation="g", unit_type="weight")
        liter = Unit.objects.create(name="Liter", abbreviation="L", unit_type="volume")

        # Duplicate name (case-insensitive)
        self.assertEqual(
            self.client.post(
                self.list_url,
                {"name": "gram", "abbreviation": "gm", "unit_type": "weight"},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Duplicate abbreviation (case-insensitive)
        self.assertEqual(
            self.client.post(
                self.list_url,
                {"name": "Milliliter", "abbreviation": "l", "unit_type": "volume"},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Non-positive conversion factor rejected
        self.assertEqual(
            self.client.post(
                self.list_url,
                {
                    "name": "Kilogram",
                    "abbreviation": "kg",
                    "unit_type": "weight",
                    "base_unit": gram.id,
                    "conversion_factor": "0",
                },
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Mismatched unit_type for base_unit rejected (volume referencing weight)
        self.assertEqual(
            self.client.post(
                self.list_url,
                {
                    "name": "Bottle",
                    "abbreviation": "btl",
                    "unit_type": "volume",
                    "base_unit": gram.id,
                    "conversion_factor": "500",
                },
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Self base_unit rejected
        self.assertEqual(
            self.client.patch(
                reverse("unit-detail", kwargs={"pk": liter.id}),
                {"base_unit": liter.id},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_delete_protection_blocks_units_used_by_derived_units_or_products(self) -> None:
        self._auth_user(self.manager)
        piece = Unit.objects.create(name="Piece", abbreviation="pcs", unit_type="count")
        box = Unit.objects.create(
            name="Box",
            abbreviation="box",
            unit_type="count",
            base_unit=piece,
            conversion_factor=Decimal("12.000000"),
        )

        # Deleting base unit referenced by derived unit -> 409 Conflict
        resp_base = self.client.delete(reverse("unit-detail", kwargs={"pk": piece.id}))
        self.assertEqual(resp_base.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Unit.objects.filter(pk=piece.id).exists())

        # Deleting unit referenced by a product FK (ProtectedError) -> 409 Conflict
        with patch.object(
            Unit,
            "delete",
            side_effect=ProtectedError("Referenced by products", set()),
        ):
            resp_prod = self.client.delete(reverse("unit-detail", kwargs={"pk": box.id}))
        self.assertEqual(resp_prod.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Unit.objects.filter(pk=box.id).exists())

    def test_search_unit_type_filter_status_filter_and_pagination(self) -> None:
        self._auth_user(self.manager)
        Unit.objects.create(name="Piece", name_km="ដុំ", abbreviation="pcs", unit_type="count", is_active=True)
        Unit.objects.create(name="Kilogram", name_km="គីឡូក្រាម", abbreviation="kg", unit_type="weight", is_active=True)
        Unit.objects.create(name="Meter", name_km="ម៉ែត្រ", abbreviation="m", unit_type="length", is_active=False)

        # Pagination
        page1 = self.client.get(f"{self.list_url}?page=1&page_size=2")
        self.assertEqual(page1.status_code, status.HTTP_200_OK)
        self.assertEqual(page1.data["count"], 3)
        self.assertEqual(len(page1.data["results"]), 2)

        # Search by Khmer name
        km = self.client.get(f"{self.list_url}?search=ដុំ")
        self.assertEqual(km.data["count"], 1)
        self.assertEqual(km.data["results"][0]["abbreviation"], "pcs")

        # Filter by unit_type
        weight = self.client.get(f"{self.list_url}?unit_type=weight")
        self.assertEqual(weight.data["count"], 1)
        self.assertEqual(weight.data["results"][0]["abbreviation"], "kg")

        # Filter by inactive
        inactive = self.client.get(f"{self.list_url}?is_active=false")
        self.assertEqual(inactive.data["count"], 1)
        self.assertEqual(inactive.data["results"][0]["abbreviation"], "m")
