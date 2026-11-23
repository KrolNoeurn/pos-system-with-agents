"""Automated tests for RBAC roles, permissions, and privilege escalation prevention."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.rbac.models import Permission, Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


class RBACAndPrivilegeEscalationTestCase(APITestCase):
    def setUp(self) -> None:
        sync_default_rbac()
        self.super_admin_role = Role.objects.get(slug="super_admin")
        self.manager_role = Role.objects.get(slug="manager")
        self.cashier_role = Role.objects.get(slug="cashier")

        self.super_admin = User.objects.create_superuser(
            username="superadmin",
            email="superadmin@pos.local",
            password="StrongPass!2026",
            full_name="Root Super Admin",
        )
        self.super_admin.roles.add(self.super_admin_role)

        # Ordinary admin with limited user/role management permissions — does NOT have settings.edit or sales.refund
        self.limited_admin_role = Role.objects.create(
            name="Branch User Admin",
            slug="branch_user_admin",
            description="Can manage basic users and custom branch roles within own permission scope.",
            is_system=False,
            is_super_admin=False,
        )
        limited_perms = Permission.objects.filter(
            code__in=[
                "users.view",
                "users.create",
                "users.edit",
                "users.delete",
                "users.deactivate",
                "roles.view",
                "roles.manage",
                "products.view",
                "sales.view",
            ]
        )
        self.limited_admin_role.permissions.set(limited_perms)

        self.ordinary_admin = User.objects.create_user(
            username="branch_admin",
            email="branch_admin@pos.local",
            password="BranchAdmin!2026",
            full_name="Branch Admin",
        )
        self.ordinary_admin.roles.add(self.limited_admin_role)

        self.basic_user = User.objects.create_user(
            username="basic_staff",
            email="basic_staff@pos.local",
            password="BasicStaff!2026",
            full_name="Basic Staff",
        )

        self.manager_user = User.objects.create_user(
            username="store_mgr",
            email="store_mgr@pos.local",
            password="StoreMgr!2026",
            full_name="Store Manager",
        )
        self.manager_user.roles.add(self.manager_role)

        self.roles_url = reverse("role-list")
        self.permissions_url = reverse("api-v1-permissions-list")
        self.users_url = reverse("user-list")

    def _auth_as(self, username: str, password: str) -> dict[str, str]:
        resp = self.client.post(
            reverse("api-v1-auth-login"),
            {"username": username, "password": password},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return {"HTTP_AUTHORIZATION": f"Bearer {resp.data['access']}"}

    def test_super_admin_can_create_custom_role_and_assign_permissions(self) -> None:
        headers = self._auth_as("superadmin", "StrongPass!2026")
        perm_ids = list(
            Permission.objects.filter(code__in=["products.view", "inventory.view"]).values_list("id", flat=True)
        )

        create_resp = self.client.post(
            self.roles_url,
            {
                "name": "Stock Viewer",
                "description": "Read-only stock access",
                "permission_ids": perm_ids,
            },
            format="json",
            **headers,
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        role_id = create_resp.data["id"]
        self.assertEqual(
            sorted(p["code"] for p in create_resp.data["permissions"]),
            ["inventory.view", "products.view"],
        )

        # Update permissions via explicit assignment endpoint
        new_perm_ids = list(
            Permission.objects.filter(code__in=["products.view", "reports.view"]).values_list("id", flat=True)
        )
        assign_resp = self.client.put(
            reverse("api-v1-role-permissions", kwargs={"pk": role_id}),
            {"permission_ids": new_perm_ids},
            format="json",
            **headers,
        )
        self.assertEqual(assign_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(
            sorted(p["code"] for p in assign_resp.data["permissions"]),
            ["products.view", "reports.view"],
        )

    def test_ordinary_admin_cannot_grant_permissions_beyond_own_scope(self) -> None:
        headers = self._auth_as("branch_admin", "BranchAdmin!2026")
        forbidden_perm = Permission.objects.get(code="settings.edit")
        allowed_perm = Permission.objects.get(code="products.view")

        # Attempt creating a role with settings.edit (which branch_admin does NOT possess)
        create_resp = self.client.post(
            self.roles_url,
            {
                "name": "Escalated Role",
                "permission_ids": [allowed_perm.id, forbidden_perm.id],
            },
            format="json",
            **headers,
        )
        self.assertEqual(create_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Creating a role within own scope succeeds
        ok_role = self.client.post(
            self.roles_url,
            {
                "name": "Branch Viewer",
                "permission_ids": [allowed_perm.id],
            },
            format="json",
            **headers,
        )
        self.assertEqual(ok_role.status_code, status.HTTP_201_CREATED)
        role_id = ok_role.data["id"]

        # Escalating that custom role afterwards via PUT /roles/{id}/permissions/ is blocked
        escalate = self.client.put(
            reverse("api-v1-role-permissions", kwargs={"pk": role_id}),
            {"permission_ids": [allowed_perm.id, forbidden_perm.id]},
            format="json",
            **headers,
        )
        self.assertEqual(escalate.status_code, status.HTTP_403_FORBIDDEN)

    def test_ordinary_admin_cannot_assign_super_admin_or_higher_role_to_user(self) -> None:
        headers = self._auth_as("branch_admin", "BranchAdmin!2026")
        assign_url = reverse("user-assign-roles", kwargs={"pk": self.basic_user.id})

        # Cannot assign Super Administrator role
        resp_sa = self.client.put(
            assign_url,
            {"role_ids": [self.super_admin_role.id]},
            format="json",
            **headers,
        )
        self.assertEqual(resp_sa.status_code, status.HTTP_403_FORBIDDEN)

        # Cannot assign Store Manager role (holds sales.refund / inventory.adjust which branch_admin lacks)
        resp_mgr = self.client.put(
            assign_url,
            {"role_ids": [self.manager_role.id]},
            format="json",
            **headers,
        )
        self.assertEqual(resp_mgr.status_code, status.HTTP_403_FORBIDDEN)

    def test_ordinary_admin_cannot_modify_or_deactivate_super_admin_or_higher_user(self) -> None:
        headers = self._auth_as("branch_admin", "BranchAdmin!2026")

        # Cannot deactivate Super Admin
        deact_sa = self.client.post(
            reverse("user-deactivate", kwargs={"pk": self.super_admin.id}),
            **headers,
        )
        self.assertEqual(deact_sa.status_code, status.HTTP_403_FORBIDDEN)

        # Cannot delete Super Admin
        del_sa = self.client.delete(
            reverse("user-detail", kwargs={"pk": self.super_admin.id}),
            **headers,
        )
        self.assertEqual(del_sa.status_code, status.HTTP_403_FORBIDDEN)

        # Cannot edit higher-privileged Store Manager
        edit_mgr = self.client.patch(
            reverse("user-detail", kwargs={"pk": self.manager_user.id}),
            {"full_name": "Hijacked"},
            format="json",
            **headers,
        )
        self.assertEqual(edit_mgr.status_code, status.HTTP_403_FORBIDDEN)

    def test_system_roles_are_protected_from_deletion_and_non_super_admin_edits(self) -> None:
        sa_headers = self._auth_as("superadmin", "StrongPass!2026")
        branch_headers = self._auth_as("branch_admin", "BranchAdmin!2026")

        # Even Super Admin cannot delete protected system roles
        del_cashier = self.client.delete(
            reverse("role-detail", kwargs={"pk": self.cashier_role.id}),
            **sa_headers,
        )
        self.assertEqual(del_cashier.status_code, status.HTTP_403_FORBIDDEN)

        # Ordinary admin cannot modify protected system role permissions
        mod_cashier = self.client.put(
            reverse("api-v1-role-permissions", kwargs={"pk": self.cashier_role.id}),
            {"permission_ids": []},
            format="json",
            **branch_headers,
        )
        self.assertEqual(mod_cashier.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthorized_user_cannot_access_roles_or_permissions(self) -> None:
        cashier = User.objects.create_user(
            username="cashier_test",
            email="cashier_test@pos.local",
            password="CashierPass!2026",
        )
        cashier.roles.add(self.cashier_role)
        headers = self._auth_as("cashier_test", "CashierPass!2026")

        self.assertEqual(self.client.get(self.roles_url, **headers).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(self.permissions_url, **headers).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.get(reverse("api-v1-audit-logs"), **headers).status_code,
            status.HTTP_403_FORBIDDEN,
        )
