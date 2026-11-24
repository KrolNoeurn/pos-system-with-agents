"""Automated tests for Customer/Supplier controls, CSV imports, and atomic Stock CSV import/adjust."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.catalog.models import Category, Product, Unit
from apps.inventory.models import StockBalance, StockMovement
from apps.purchasing.models import Supplier
from apps.rbac.models import Role
from apps.sales.models import Customer

User = get_user_model()


class PartnerControlAndStockImportAPITestCase(APITestCase):
    def setUp(self):
        call_command("seed_rbac")
        self.manager = self._create_user_with_role("imp_mgr", "manager")
        self.cashier = self._create_user_with_role("imp_cashier", "cashier")
        self.clerk = self._create_user_with_role("imp_clerk", "inventory_clerk")
        self.accountant = self._create_user_with_role("imp_acct", "accountant")

        cat = Category.objects.create(name="Drinks", slug="drinks")
        unit = Unit.objects.create(name="Piece", abbreviation="pcs", unit_type=Unit.UnitType.COUNT)
        self.coffee = Product.objects.create(
            sku="IMP-COF-01",
            name="Coffee",
            category=cat,
            unit=unit,
            purchase_cost=Decimal("2.00"),
            selling_price=Decimal("4.50"),
            track_inventory=True,
        )
        self.tea = Product.objects.create(
            sku="IMP-TEA-01",
            name="Green Tea",
            category=cat,
            unit=unit,
            purchase_cost=Decimal("1.50"),
            selling_price=Decimal("3.50"),
            track_inventory=True,
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

    def test_customer_import_csv_and_activate_deactivate_controls(self):
        self._auth(self.manager)

        csv_payload = (
            "name,phone,email,address,notes,is_active\n"
            "Sokha Chan,012111222,sokha@example.com,Phnom Penh,VIP,true\n"
            "Vanna Lim,012333444,,Siem Reap,Regular,true\n"
        )
        upload = SimpleUploadedFile("customers.csv", csv_payload.encode("utf-8"), content_type="text/csv")
        res = self.client.post("/api/v1/customers/import-csv/", {"file": upload}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["created_count"], 2)
        self.assertEqual(res.data["updated_count"], 0)
        self.assertTrue(AuditLog.objects.filter(action="customer.imported").exists())

        # Re-importing updates existing customer by name
        res2 = self.client.post(
            "/api/v1/customers/import-csv/",
            {"csv_text": "name,phone,address\nSokha Chan,012999000,Kampot\n"},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["updated_count"], 1)
        sokha = Customer.objects.get(name="Sokha Chan")
        self.assertEqual(sokha.phone, "012999000")

        # Deactivate & Activate controls
        deact = self.client.post(f"/api/v1/customers/{sokha.id}/deactivate/")
        self.assertEqual(deact.status_code, status.HTTP_200_OK)
        self.assertFalse(deact.data["is_active"])

        act = self.client.post(f"/api/v1/customers/{sokha.id}/activate/")
        self.assertEqual(act.status_code, status.HTTP_200_OK)
        self.assertTrue(act.data["is_active"])

        # RBAC: accountant lacks customers.create & customers.edit
        self._auth(self.accountant)
        self.assertEqual(
            self.client.post("/api/v1/customers/import-csv/", {"csv_text": "name\nBad"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(f"/api/v1/customers/{sokha.id}/deactivate/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_supplier_import_csv_and_activate_deactivate_controls(self):
        self._auth(self.manager)

        csv_text = (
            "name,contact_name,phone,email,address,is_active\n"
            "Mekong Supply,Dara,023555666,sales@mekong.com,Phnom Penh,true\n"
            "Tonle Goods,Bopha,023777888,,Kandal,true\n"
        )
        res = self.client.post("/api/v1/suppliers/import-csv/", {"csv_text": csv_text}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["created_count"], 2)
        self.assertTrue(AuditLog.objects.filter(action="supplier.imported").exists())

        sup = Supplier.objects.get(name="Mekong Supply")
        deact = self.client.post(f"/api/v1/suppliers/{sup.id}/deactivate/")
        self.assertEqual(deact.status_code, status.HTTP_200_OK)
        self.assertFalse(deact.data["is_active"])

        act = self.client.post(f"/api/v1/suppliers/{sup.id}/activate/")
        self.assertEqual(act.status_code, status.HTTP_200_OK)
        self.assertTrue(act.data["is_active"])

        # RBAC: cashier cannot import or edit suppliers
        self._auth(self.cashier)
        self.assertEqual(
            self.client.post("/api/v1/suppliers/import-csv/", {"csv_text": "name\nX"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_inventory_csv_import_and_adjust_is_atomic_and_enforces_rules(self):
        self._auth(self.clerk)

        # Valid bulk import: opening stock + stock_in + adjustment increase + adjustment decrease
        valid_csv = (
            "sku,operation,quantity,unit_cost,reference_code,notes\n"
            "IMP-COF-01,opening,10,2.00,INIT-01,Initial stock\n"
            "IMP-COF-01,stock_in,5,2.60,SUP-01,Supplier restock\n"
            "IMP-TEA-01,opening,8,1.50,INIT-01,Initial tea\n"
            "IMP-TEA-01,decrease,2,,COUNT-01,Damaged packets\n"
        )
        res = self.client.post(
            "/api/v1/inventory/import-adjust/",
            {
                "csv_text": valid_csv,
                "partner_type": "supplier",
                "partner_name": "Mekong Supply",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["processed_count"], 4)

        cof_bal = StockBalance.objects.get(product=self.coffee)
        tea_bal = StockBalance.objects.get(product=self.tea)
        self.assertEqual(cof_bal.quantity_on_hand, Decimal("15.000"))
        self.assertEqual(cof_bal.average_unit_cost, Decimal("2.20"))
        self.assertEqual(tea_bal.quantity_on_hand, Decimal("6.000"))
        self.assertTrue(
            StockMovement.objects.filter(notes__icontains="[Supplier: Mekong Supply]").exists()
        )
        self.assertTrue(AuditLog.objects.filter(action="inventory.bulk_imported").exists())

        # Atomic rollback: row 1 is valid, row 2 triggers insufficient stock -> NOTHING applied!
        bad_csv = (
            "sku,operation,quantity,unit_cost,reference_code,notes\n"
            "IMP-COF-01,stock_in,10,2.00,BATCH-2,Should rollback\n"
            "IMP-TEA-01,stock_out,999,,BATCH-2,Over deduction\n"
        )
        bad_res = self.client.post(
            "/api/v1/inventory/import-adjust/", {"csv_text": bad_csv}, format="json"
        )
        self.assertEqual(bad_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rows", bad_res.data)
        cof_bal.refresh_from_db()
        self.assertEqual(cof_bal.quantity_on_hand, Decimal("15.000"))

        # RBAC: cashier cannot import/adjust stock
        self._auth(self.cashier)
        self.assertEqual(
            self.client.post(
                "/api/v1/inventory/import-adjust/", {"csv_text": valid_csv}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
