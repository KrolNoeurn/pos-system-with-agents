# Database Schema

> **Status:** Initial Schema Blueprint (No Django Migrations Created Yet)

## 1. Database & Data Integrity Standards

- **Engine:** SQLite for initial local development; PostgreSQL-compatible column types, constraints, and indexes throughout.
- **Monetary Precision:** All monetary columns use `DECIMAL(12, 2)` (`DecimalField(max_digits=12, decimal_places=2)`). Never use floating-point columns for prices, taxes, discounts, costs, or payments.
- **Quantity Precision:** Use `DECIMAL(12, 3)` (or integer where unit requires whole counts) to support fractional units (e.g., kg, liters) cleanly.
- **Timestamps:** Store timezone-aware UTC timestamps (`created_at`, `updated_at`).
- **Referential Integrity:** Use `ON DELETE RESTRICT` / Django `models.PROTECT` on foreign keys referenced by financial or stock history (products, users, customers, payment methods) to protect historical records.

## 2. Planned Core Entities

### Accounts & RBAC
- **`users`**: `id`, `username` (unique), `email` (unique), `full_name`, `password_hash`, `is_active`, `is_superuser`, `preferred_language` (`en`/`km`), `preferred_theme` (`light`/`dark`), `preferred_layout` (`vertical`/`horizontal`), `last_login`, `created_at`, `updated_at`
- **`roles`**: `id`, `name` (unique), `slug` (unique), `description`, `is_system` (protects built-in roles), `created_at`, `updated_at`
- **`permissions`**: `id`, `code` (unique, `<module>.<action>`), `module`, `action`, `description`
- **`role_permissions`**: `role_id` (FK), `permission_id` (FK) — unique `(role_id, permission_id)`
- **`user_roles`**: `user_id` (FK), `role_id` (FK) — unique `(user_id, role_id)`

### Catalog & Inventory
- **`categories`**: `id`, `name` (unique), `parent_id` (nullable self-FK), `is_active`, `created_at`, `updated_at`
- **`units`**: `id`, `name`, `short_name` (unique), `allow_decimal`, `is_active`
- **`products`**: `id`, `sku` (unique, indexed), `barcode` (nullable, unique, indexed), `name`, `name_km` (optional Khmer display name), `category_id` (FK, `PROTECT`), `unit_id` (FK, `PROTECT`), `cost_price`, `selling_price`, `tax_rate`, `low_stock_threshold`, `track_inventory`, `is_active`, `created_at`, `updated_at`
- **`stock_balances`**: `id`, `product_id` (OneToOne FK, `PROTECT`), `quantity_on_hand`, `updated_at`
- **`stock_movements`** *(append-only ledger)*: `id`, `product_id` (FK, `PROTECT`), `movement_type` (`SALE`, `PURCHASE`, `ADJUSTMENT`, `REFUND`, `VOID`), `quantity_delta`, `balance_after`, `reference_type`, `reference_id`, `reason`, `created_by_id` (FK, `PROTECT`), `created_at`

### Sales & Payments
- **`customers`**: `id`, `code` (unique), `name`, `phone` (indexed), `email`, `address`, `is_active`, `created_at`, `updated_at`
- **`sales`**: `id`, `invoice_number` (unique, indexed), `customer_id` (nullable FK, `PROTECT`), `cashier_id` (FK, `PROTECT`), `status` (`COMPLETED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`), `subtotal`, `discount_amount`, `tax_amount`, `grand_total`, `paid_total`, `change_due`, `idempotency_key` (unique, nullable), `notes`, `completed_at`, `created_at`, `updated_at`
- **`sale_items`** *(price & tax snapshots)*: `id`, `sale_id` (FK, `CASCADE`), `product_id` (FK, `PROTECT`), `product_name_snapshot`, `sku_snapshot`, `quantity`, `unit_price_snapshot`, `unit_cost_snapshot`, `discount_amount`, `tax_rate_snapshot`, `tax_amount`, `line_total`
- **`sale_payments`**: `id`, `sale_id` (FK, `CASCADE`), `payment_method` (`CASH`, `CARD`, `QR`, `BANK_TRANSFER`), `amount`, `reference_no`, `received_by_id` (FK, `PROTECT`), `paid_at`

### Purchasing, Expenses, Settings & Audit
- **`suppliers`**: `id`, `name`, `contact_name`, `phone`, `email`, `address`, `is_active`, `created_at`, `updated_at`
- **`purchases`** & **`purchase_items`**: Supplier orders, received quantities, unit costs, status (`DRAFT`, `RECEIVED`, `CANCELLED`), and timestamps.
- **`expense_categories`** & **`expenses`**: Categorized operational expenses with amount, date, notes, and recorded-by user.
- **`store_settings`**: Store name, address, phone, default currency, default tax rate, receipt header/footer, default language.
- **`audit_logs`** *(append-only)*: `id`, `actor_id` (nullable FK, `SET_NULL`), `action`, `target_type`, `target_id`, `ip_address`, `metadata` (JSON), `created_at` (indexed).

## 3. Revision Log

| Date | Change | Author / Phase |
| :--- | :--- | :--- |
| 2026-11-23 | Initial schema blueprint established | Phase 0 — Foundation |
