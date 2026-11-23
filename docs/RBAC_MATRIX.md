# RBAC Matrix & Access Control Specification

> **Status:** Implemented Server-Side in Django (`apps/rbac`, `apps/accounts`, `apps/audit`) & Aligned in React (`AuthContext`, `ProtectedRoute`)

## 1. Security Governance Rules (Enforced Server-Side)

1. **Django Is Authoritative:** Every protected API endpoint enforces `JWTAuthentication`, `IsActiveAuthenticated` (blocking deactivated accounts immediately even with unexpired tokens), and explicit `<module>.<action>` permissions.
2. **Frontend Guards Are UX Only:** React hides unauthorized navigation/actions and redirects unauthorized routes to `/unauthorized`, while Django independently enforces every request.
3. **Anti-Privilege-Escalation Protections:**
   - Only a Super Administrator (`is_superuser=True` or assigned an `is_super_admin=True` role) may manage Super Administrator accounts, protected system accounts (`is_system_account=True`), or assign the Super Administrator role.
   - Non-super-admin users cannot grant any permission they do not personally hold when creating/editing roles or assigning permissions to roles.
   - Non-super-admin users cannot assign any role whose permissions exceed their own authority, nor edit/deactivate/delete users who hold permissions outside their own authority.
   - System roles (`is_system=True`: `super_admin`, `manager`, `cashier`, `inventory_clerk`, `accountant`) cannot be deleted, and cannot be modified by non-super-admins.
   - Self-deactivation, self-deletion, and removing/deactivating the last active Super Administrator are blocked.

## 2. Canonical Seeded Permission Catalog (39 Permissions)

Seeded idempotently via `python manage.py seed_rbac`:

| Module | Permission Codes |
| :--- | :--- |
| Dashboard | `dashboard.view` |
| Users | `users.view`, `users.create`, `users.edit`, `users.delete`, `users.deactivate` |
| Roles | `roles.view`, `roles.manage` |
| Products | `products.view`, `products.create`, `products.edit`, `products.delete`, `products.edit_price` |
| Inventory | `inventory.view`, `inventory.adjust` |
| Customers | `customers.view`, `customers.create`, `customers.edit` |
| Suppliers | `suppliers.view`, `suppliers.create`, `suppliers.edit` |
| Sales / POS | `sales.view`, `sales.create`, `sales.discount`, `sales.cancel`, `sales.refund` |
| Purchases | `purchases.view`, `purchases.create`, `purchases.receive`, `purchases.cancel` |
| Expenses | `expenses.view`, `expenses.create`, `expenses.edit`, `expenses.delete` |
| Reports | `reports.view`, `reports.export` |
| Settings | `settings.view`, `settings.edit` |
| Audit Logs | `audit.view` |

## 3. Default System Roles (`is_system=True`)

| Role Slug | Display Name | Scope Summary |
| :--- | :--- | :--- |
| `super_admin` | Super Administrator | `is_super_admin=True`; unrestricted access to all 39 permissions |
| `manager` | Store Manager | Store operations, catalog/pricing, inventory, sales/refunds, purchasing, expenses, reports, read-only users/roles/settings/audit |
| `cashier` | Cashier | `dashboard.view`, `products.view`, `inventory.view`, `customers.view/create`, `sales.view/create/discount` |
| `inventory_clerk` | Inventory Clerk | `dashboard.view`, `products.view/create/edit`, `inventory.view/adjust`, `suppliers.view/create`, `purchases.view/create/receive` |
| `accountant` | Accountant | Read-oriented sales/purchases/catalog/inventory/customers/suppliers/settings/audit, expenses view/create/edit, reports view/export |

## 4. Implemented Security Audit Events (`audit_logs`)

Automatically recorded without storing passwords or tokens (redacted by `apps/audit/services.py`):
- `auth.login`, `auth.login_failed`, `auth.logout`, `auth.profile_updated`, `auth.password_changed`
- `user.created`, `user.updated`, `user.activated`, `user.deactivated`, `user.deleted`, `user.roles_assigned`
- `role.created`, `role.updated`, `role.deleted`, `role.permissions_assigned`
