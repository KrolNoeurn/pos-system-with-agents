# Database Schema

> **Status:** Phase 3 Implemented (`accounts`, `rbac`, `audit`, `token_blacklist`); Domain Business Tables Planned

## 1. Database & Data Integrity Standards

- **Engine:** SQLite for initial local development; PostgreSQL-compatible column types, constraints, and indexes throughout.
- **Monetary Precision (Future Domain Tables):** All monetary columns will use `DECIMAL(12, 2)` (`DecimalField(max_digits=12, decimal_places=2)`). Never use floating-point columns for financial values.
- **Timestamps:** Timezone-aware UTC timestamps (`created_at`, `updated_at`).
- **Referential Integrity:** `models.PROTECT` on historical financial references; `models.SET_NULL` on `audit_logs.actor` so audit trails survive user removal.

## 2. Implemented Tables (Phase 3 Migrations Applied)

### `accounts_users` (`apps/accounts/migrations/0001_initial.py`)
- `id` (PK), `username` (unique, indexed), `email` (unique, indexed), `password` (PBKDF2 hash), `full_name`, `phone`
- `is_active` (indexed), `is_staff`, `is_superuser`, `is_system_account`
- `preferred_language` (`en`/`km`), `preferred_theme` (`light`/`dark`), `preferred_layout` (`vertical`/`horizontal`)
- `last_login`, `created_at`, `updated_at`
- M2M `accounts_users_roles` -> `rbac_roles`

### `rbac_permissions` & `rbac_roles` (`apps/rbac/migrations/0001_initial.py`)
- `rbac_permissions`: `id` (PK), `code` (unique, indexed), `module` (indexed), `action` (indexed), `description`, unique constraint `(module, action)`
- `rbac_roles`: `id` (PK), `name` (unique), `slug` (unique, indexed), `description`, `is_system`, `is_super_admin`, `created_at`, `updated_at`
- M2M `rbac_roles_permissions` -> `rbac_permissions`

### `audit_logs` (`apps/audit/migrations/0001_initial.py`)
- `id` (PK), `actor_id` (nullable FK to `accounts_users`, `SET_NULL`), `action` (indexed), `target_type` (indexed), `target_id`, `ip_address`, `metadata` (JSON), `created_at` (indexed)

### JWT Blacklist (`rest_framework_simplejwt.token_blacklist`)
- `token_blacklist_outstandingtoken`, `token_blacklist_blacklistedtoken`

## 3. Planned Domain Tables (Not Yet Implemented)

- **Catalog & Inventory:** `categories`, `units`, `products`, `stock_balances`, `stock_movements`
- **Sales & Payments:** `customers`, `sales`, `sale_items` (price/tax snapshots), `sale_payments`
- **Purchasing, Expenses & Settings:** `suppliers`, `purchases`, `purchase_items`, `expense_categories`, `expenses`, `store_settings`

## 4. Revision Log

| Date | Change | Phase |
| :--- | :--- | :--- |
| 2026-11-23 | Initial schema blueprint established | Phase 0 — Foundation |
| 2026-11-23 | Implemented `accounts_users`, `rbac_permissions`, `rbac_roles`, `audit_logs`, and JWT blacklist migrations | Phase 3 — Auth & RBAC |
