# RBAC Matrix & Access Control Specification

> **Status:** Initial Specification (Enforced Server-Side in Django Once Implemented)

## 1. Security Governance Rules

1. **Django Is Authoritative:** Every protected API endpoint enforces authentication, `user.is_active`, and explicit `<module>.<action>` permissions server-side.
2. **Frontend Guards Are UX Only:** React hides unauthorized menus/buttons and blocks restricted routes based on `/api/v1/auth/me/`, but never substitutes for backend checks.
3. **Anti-Escalation Protection:**
   - Only Super Administrators may modify Super Administrator accounts or assign the Super Administrator role.
   - Users may never grant permissions they do not possess.
   - System roles (`super_admin`, `manager`, `cashier`, `inventory_clerk`, `accountant`) cannot be deleted.
   - The last active Super Administrator cannot be deactivated or demoted.

## 2. Canonical Permission Catalog

| Module | Permission Codes |
| :--- | :--- |
| Dashboard | `dashboard.view` |
| Users | `users.view`, `users.create`, `users.edit`, `users.deactivate` |
| Roles | `roles.view`, `roles.manage` |
| Catalog | `products.view`, `products.create`, `products.edit`, `products.delete`, `products.edit_price` |
| Inventory | `inventory.view`, `inventory.adjust` |
| Customers | `customers.view`, `customers.create`, `customers.edit` |
| Suppliers | `suppliers.view`, `suppliers.create`, `suppliers.edit` |
| Sales / POS | `sales.view`, `sales.create`, `sales.discount`, `sales.cancel`, `sales.refund` |
| Purchases | `purchases.view`, `purchases.create`, `purchases.receive`, `purchases.cancel` |
| Expenses | `expenses.view`, `expenses.create`, `expenses.edit`, `expenses.delete` |
| Reports | `reports.view`, `reports.export` |
| Settings | `settings.view`, `settings.edit` |
| Audit Logs | `audit.view` |

## 3. Default Role-to-Permission Matrix

| Permission Group | Super Admin | Store Manager | Cashier | Inventory Clerk | Accountant |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `dashboard.view` | Yes | Yes | Yes (limited) | Yes (limited) | Yes |
| `users.*` | Full | View only | No | No | No |
| `roles.*` | Full | View only | No | No | No |
| `products.view` | Yes | Yes | Yes | Yes | Yes |
| `products.create/edit/delete` | Yes | Yes | No | Create/Edit | No |
| `products.edit_price` | Yes | Yes | No | No | No |
| `inventory.view` | Yes | Yes | Yes | Yes | Yes |
| `inventory.adjust` | Yes | Yes | No | Yes | No |
| `customers.view/create/edit` | Full | Full | View/Create | No | View |
| `suppliers.view/create/edit` | Full | Full | No | View/Create | View |
| `sales.view` | Yes | Yes | Own/Shift | No | Yes |
| `sales.create` | Yes | Yes | Yes | No | No |
| `sales.discount` | Yes | Yes | Policy-limited | No | No |
| `sales.cancel` / `sales.refund` | Yes | Yes | No | No | No |
| `purchases.*` | Full | Full | No | View/Create/Receive | View |
| `expenses.*` | Full | Full | No | No | View/Create/Edit |
| `reports.view` / `reports.export` | Yes / Yes | Yes / Yes | No | Inventory only | Yes / Yes |
| `settings.view` / `settings.edit` | Yes / Yes | View only | No | No | View only |
| `audit.view` | Yes | Yes (store ops) | No | No | Yes |

## 4. Mandatory Audited Actions

All of the following operations must create an append-only `audit_logs` record:
- Login / logout / failed login / password change
- User create / edit / deactivate
- Role create / edit / delete / permission assignment / user-role assignment
- Product price or cost change
- Manual stock adjustment
- Sale cancellation, refund, or manual discount override
- System or tax setting updates
