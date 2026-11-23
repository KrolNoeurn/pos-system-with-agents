"""Automated tests for JWT authentication, profile, password change, and user management."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.rbac.models import Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


class AuthenticationAndUserAPITestCase(APITestCase):
    def setUp(self) -> None:
        sync_default_rbac()
        self.super_admin_role = Role.objects.get(slug="super_admin")
        self.cashier_role = Role.objects.get(slug="cashier")
        self.manager_role = Role.objects.get(slug="manager")

        self.super_admin = User.objects.create_superuser(
            username="superadmin",
            email="superadmin@pos.local",
            password="StrongPass!2026",
            full_name="Root Super Admin",
        )
        self.super_admin.roles.add(self.super_admin_role)

        self.cashier = User.objects.create_user(
            username="cashier1",
            email="cashier1@pos.local",
            password="CashierPass!2026",
            full_name="Front Cashier",
        )
        self.cashier.roles.add(self.cashier_role)

        self.inactive_user = User.objects.create_user(
            username="disabled1",
            email="disabled1@pos.local",
            password="DisabledPass!2026",
            full_name="Inactive Staff",
            is_active=False,
        )
        self.inactive_user.roles.add(self.cashier_role)

        self.login_url = reverse("api-v1-auth-login")
        self.refresh_url = reverse("api-v1-auth-refresh")
        self.logout_url = reverse("api-v1-auth-logout")
        self.me_url = reverse("api-v1-auth-me")
        self.change_password_url = reverse("api-v1-auth-change-password")
        self.users_url = reverse("user-list")

    def _login(self, username: str, password: str):
        return self.client.post(
            self.login_url,
            {"username": username, "password": password},
            format="json",
        )

    def _auth_header(self, access_token: str) -> dict[str, str]:
        return {"HTTP_AUTHORIZATION": f"Bearer {access_token}"}

    def test_valid_login_returns_jwt_and_user_permissions(self) -> None:
        resp = self._login("cashier1", "CashierPass!2026")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertEqual(resp.data["user"]["username"], "cashier1")
        self.assertIn("sales.create", resp.data["user"]["permissions"])
        self.assertTrue(AuditLog.objects.filter(action="auth.login", actor=self.cashier).exists())

    def test_invalid_login_rejected_and_audited_without_password(self) -> None:
        resp = self._login("cashier1", "WrongPassword!999")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
        log = AuditLog.objects.filter(action="auth.login_failed").latest("id")
        self.assertNotIn("WrongPassword!999", str(log.metadata))

    def test_inactive_user_cannot_login(self) -> None:
        resp = self._login("disabled1", "DisabledPass!2026")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_deactivated_user_existing_tokens_are_rejected(self) -> None:
        login_resp = self._login("cashier1", "CashierPass!2026")
        access = login_resp.data["access"]
        refresh = login_resp.data["refresh"]

        # Deactivate user after tokens were issued
        self.cashier.is_active = False
        self.cashier.save(update_fields=["is_active"])

        me_resp = self.client.get(self.me_url, **self._auth_header(access))
        self.assertEqual(me_resp.status_code, status.HTTP_401_UNAUTHORIZED)

        refresh_resp = self.client.post(self.refresh_url, {"refresh": refresh}, format="json")
        self.assertEqual(refresh_resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_access_without_authentication_returns_401(self) -> None:
        for url in (
            self.me_url,
            self.users_url,
            reverse("role-list"),
            reverse("api-v1-permissions-list"),
            reverse("api-v1-audit-logs"),
        ):
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED, f"Expected 401 on {url}")

    def test_token_refresh_and_logout_blacklist(self) -> None:
        login_resp = self._login("cashier1", "CashierPass!2026")
        access = login_resp.data["access"]
        refresh = login_resp.data["refresh"]

        refreshed = self.client.post(self.refresh_url, {"refresh": refresh}, format="json")
        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)
        new_refresh = refreshed.data["refresh"]

        # Old rotated refresh token must be blacklisted
        replay = self.client.post(self.refresh_url, {"refresh": refresh}, format="json")
        self.assertEqual(replay.status_code, status.HTTP_401_UNAUTHORIZED)

        # Logout blacklists the active refresh token
        logout_resp = self.client.post(
            self.logout_url,
            {"refresh": new_refresh},
            format="json",
            **self._auth_header(access),
        )
        self.assertEqual(logout_resp.status_code, status.HTTP_204_NO_CONTENT)
        after_logout = self.client.post(self.refresh_url, {"refresh": new_refresh}, format="json")
        self.assertEqual(after_logout.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_update_blocks_mass_assignment(self) -> None:
        access = self._login("cashier1", "CashierPass!2026").data["access"]
        resp = self.client.patch(
            self.me_url,
            {
                "full_name": "Updated Cashier",
                "preferred_language": "km",
                "is_superuser": True,
                "is_active": False,
                "roles": [self.super_admin_role.id],
            },
            format="json",
            **self._auth_header(access),
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.cashier.refresh_from_db()
        self.assertEqual(self.cashier.full_name, "Updated Cashier")
        self.assertEqual(self.cashier.preferred_language, "km")
        self.assertFalse(self.cashier.is_superuser)
        self.assertTrue(self.cashier.is_active)
        self.assertFalse(self.cashier.is_super_admin_user)

    def test_password_change_flow_and_validation(self) -> None:
        access = self._login("cashier1", "CashierPass!2026").data["access"]

        wrong = self.client.post(
            self.change_password_url,
            {
                "current_password": "WrongOldPassword!",
                "new_password": "NewSecurePass!2026",
                "confirm_password": "NewSecurePass!2026",
            },
            format="json",
            **self._auth_header(access),
        )
        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST)

        ok = self.client.post(
            self.change_password_url,
            {
                "current_password": "CashierPass!2026",
                "new_password": "NewSecurePass!2026",
                "confirm_password": "NewSecurePass!2026",
            },
            format="json",
            **self._auth_header(access),
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertEqual(self._login("cashier1", "CashierPass!2026").status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self._login("cashier1", "NewSecurePass!2026").status_code, status.HTTP_200_OK)

    def test_user_without_permission_gets_403_on_user_endpoints(self) -> None:
        access = self._login("cashier1", "CashierPass!2026").data["access"]
        resp = self.client.get(self.users_url, **self._auth_header(access))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        create_resp = self.client.post(
            self.users_url,
            {
                "username": "unauthorized_new",
                "email": "unauth@pos.local",
                "password": "ValidPassword!2026",
            },
            format="json",
            **self._auth_header(access),
        )
        self.assertEqual(create_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_super_admin_user_lifecycle_and_role_assignment(self) -> None:
        access = self._login("superadmin", "StrongPass!2026").data["access"]

        # Create user with cashier role
        created = self.client.post(
            self.users_url,
            {
                "username": "newstaff",
                "email": "newstaff@pos.local",
                "password": "StaffPassword!2026",
                "full_name": "New Staff",
                "role_ids": [self.cashier_role.id],
            },
            format="json",
            **self._auth_header(access),
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        user_id = created.data["id"]
        self.assertEqual([r["slug"] for r in created.data["roles"]], ["cashier"])

        # Reassign roles to manager
        roles_url = reverse("user-assign-roles", kwargs={"pk": user_id})
        assigned = self.client.put(
            roles_url,
            {"role_ids": [self.manager_role.id]},
            format="json",
            **self._auth_header(access),
        )
        self.assertEqual(assigned.status_code, status.HTTP_200_OK)
        self.assertEqual([r["slug"] for r in assigned.data["roles"]], ["manager"])

        # Deactivate & reactivate user
        deactivate_url = reverse("user-deactivate", kwargs={"pk": user_id})
        activate_url = reverse("user-activate", kwargs={"pk": user_id})
        deact = self.client.post(deactivate_url, **self._auth_header(access))
        self.assertEqual(deact.status_code, status.HTTP_200_OK)
        self.assertFalse(deact.data["is_active"])
        self.assertEqual(self._login("newstaff", "StaffPassword!2026").status_code, status.HTTP_401_UNAUTHORIZED)

        act = self.client.post(activate_url, **self._auth_header(access))
        self.assertEqual(act.status_code, status.HTTP_200_OK)
        self.assertTrue(act.data["is_active"])
        self.assertEqual(self._login("newstaff", "StaffPassword!2026").status_code, status.HTTP_200_OK)

        # Self-deactivation blocked
        self_deact = self.client.post(
            reverse("user-deactivate", kwargs={"pk": self.super_admin.id}),
            **self._auth_header(access),
        )
        self.assertEqual(self_deact.status_code, status.HTTP_400_BAD_REQUEST)
