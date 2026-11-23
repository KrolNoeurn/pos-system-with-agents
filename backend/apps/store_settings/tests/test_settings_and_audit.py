"""Automated tests for Store Settings, Receipt Profile, and Audit Log Viewer APIs."""

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.audit.services import log_audit_event
from apps.rbac.models import Role

User = get_user_model()


class StoreSettingsAndAuditAPITestCase(APITestCase):
    def setUp(self):
        call_command("seed_rbac")
        self.super_admin = self._create_user_with_role("set_super", "super_admin")
        self.manager = self._create_user_with_role("set_mgr", "manager")
        self.accountant = self._create_user_with_role("set_acct", "accountant")
        self.cashier = self._create_user_with_role("set_cashier", "cashier")

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

    def test_store_settings_rbac_update_audit_and_receipt_profile(self):
        # Unauthenticated rejected
        self.assertEqual(self.client.get("/api/v1/settings/").status_code, status.HTTP_401_UNAUTHORIZED)

        # Cashier cannot access /api/v1/settings/ (403) but CAN read non-sensitive receipt-profile
        self._auth(self.cashier)
        self.assertEqual(self.client.get("/api/v1/settings/").status_code, status.HTTP_403_FORBIDDEN)
        rp_res = self.client.get("/api/v1/settings/receipt-profile/")
        self.assertEqual(rp_res.status_code, status.HTTP_200_OK)
        self.assertEqual(rp_res.data["store_name"], "POS Store")
        self.assertEqual(rp_res.data["exchange_rate_khr"], "4100.00")

        # Manager & Accountant can view /api/v1/settings/, but CANNOT edit (lack settings.edit)
        for ro_user in (self.manager, self.accountant):
            self._auth(ro_user)
            self.assertEqual(self.client.get("/api/v1/settings/").status_code, status.HTTP_200_OK)
            self.assertEqual(
                self.client.patch(
                    "/api/v1/settings/", {"store_name": "Unauthorized Edit"}, format="json"
                ).status_code,
                status.HTTP_403_FORBIDDEN,
            )

        # Super Admin updates store settings & validation rejects invalid numbers
        self._auth(self.super_admin)
        self.assertEqual(
            self.client.patch(
                "/api/v1/settings/", {"exchange_rate_khr": "0.00"}, format="json"
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.patch(
                "/api/v1/settings/", {"default_tax_rate": "150.00"}, format="json"
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        patch_res = self.client.patch(
            "/api/v1/settings/",
            {
                "store_name": "Angkor Mart POS",
                "store_name_km": "អង្គរ ម៉ាត POS",
                "phone": "023-999-888",
                "address": "Phnom Penh, Cambodia",
                "tax_id": "K001-99887766",
                "exchange_rate_khr": "4050.00",
                "default_tax_rate": "10.00",
                "receipt_header": "Welcome to Angkor Mart!",
                "receipt_footer": "See you again soon!",
                "show_tax_id_on_receipt": True,
            },
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["store_name"], "Angkor Mart POS")
        self.assertEqual(patch_res.data["exchange_rate_khr"], "4050.00")
        self.assertEqual(patch_res.data["updated_by_username"], "set_super")

        # Audit log recorded for settings.updated
        self.assertTrue(
            AuditLog.objects.filter(
                action="settings.updated", target_type="StoreSetting"
            ).exists()
        )

        # Cashier receipt-profile reflects live updated settings immediately
        self._auth(self.cashier)
        rp_updated = self.client.get("/api/v1/settings/receipt-profile/")
        self.assertEqual(rp_updated.status_code, status.HTTP_200_OK)
        self.assertEqual(rp_updated.data["store_name"], "Angkor Mart POS")
        self.assertEqual(rp_updated.data["tax_id"], "K001-99887766")

    def test_audit_log_viewer_filters_immutability_and_rbac(self):
        log_audit_event(
            actor=self.manager,
            action="sale.completed",
            target_type="Sale",
            target_id="99",
            metadata={"sale_number": "INV-99", "password": "secret-must-be-redacted"},
        )
        log_audit_event(
            actor=self.super_admin,
            action="settings.updated",
            target_type="StoreSetting",
            target_id="1",
            metadata={"changed_fields": ["store_name"]},
        )

        # Cashier cannot access audit logs (403)
        self._auth(self.cashier)
        self.assertEqual(
            self.client.get("/api/v1/audit-logs/").status_code, status.HTTP_403_FORBIDDEN
        )

        # Manager & Accountant can inspect audit logs with search, target_type, action, and date filters
        self._auth(self.accountant)
        today = str(timezone.localdate())
        res = self.client.get(
            f"/api/v1/audit-logs/?search=sale.completed&target_type=Sale&date_from={today}&date_to={today}"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        entry = res.data["results"][0]
        self.assertEqual(entry["actor_username"], "set_mgr")
        self.assertEqual(entry["metadata"]["password"], "[REDACTED]")

        # Audit logs endpoint is strictly read-only (POST/DELETE rejected)
        self._auth(self.super_admin)
        self.assertEqual(
            self.client.post("/api/v1/audit-logs/", {"action": "fake"}, format="json").status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
