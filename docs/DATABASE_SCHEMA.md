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

### `catalog_categories` (`apps/catalog/migrations/0001_initial.py`)
- `id` (PK), `name` (unique, indexed), `name_km` (optional Khmer display name), `slug` (unique, indexed)
- `parent_id` (nullable self-FK with `on_delete=models.PROTECT`, preventing deletion of parent categories in use)
- `description`, `is_active` (indexed), `created_at`, `updated_at`

### `catalog_units` (`apps/catalog/migrations/0002_unit.py`)
- `id` (PK), `name` (unique, indexed), `name_km` (optional Khmer display name), `abbreviation` (unique, indexed)
- `unit_type` (`count` | `weight` | `volume` | `length` | `other`, indexed), `allow_decimal`
- Extensible conversion columns: `base_unit_id` (nullable self-FK with `on_delete=models.PROTECT`), `conversion_factor` (`DECIMAL(14, 6)`, default `1.000000`, DB check `> 0`)
- `is_active` (indexed), `created_at`, `updated_at`

### `catalog_products` & `catalog_product_images` (`apps/catalog/migrations/0003_product.py`, `0004_productimage.py`)
- `catalog_products`: `id` (PK), `sku` (unique, indexed), `barcode` (nullable, unique, indexed), `name` (indexed), `name_km`, `description`, `image` (legacy fallback `ImageField` under `media/products/YYYY/MM/`), `category_id` (`PROTECT`), `unit_id` (`PROTECT`), monetary columns (`purchase_cost`, `selling_price`, `wholesale_price`, `tax_rate`), `min_stock_threshold`, `track_inventory`, `is_active`, timestamps
- `catalog_product_images`: `id` (PK), `product_id` (FK -> `catalog_products`, `CASCADE`), `image` (`ImageField` under `media/products/YYYY/MM/`), `alt_text`, `is_primary` (indexed), `sort_order`, `created_at` (up to 10 images per product)

### `inventory_stock_balances` & `inventory_stock_movements` (`apps/inventory/migrations/0001_initial.py`)
- `inventory_stock_balances`: `id` (PK), `product_id` (OneToOne FK -> `catalog_products`, `PROTECT`), `quantity_on_hand` (`DECIMAL(14,3)`), `average_unit_cost` (`DECIMAL(12,2)` weighted moving average), `updated_at`
- `inventory_stock_movements` *(append-only ledger)*: `id` (PK), `product_id` (FK -> `catalog_products`, `PROTECT`), `movement_type` (`opening` | `stock_in` | `stock_out` | `adjustment` | `sale` | `purchase` | `refund` | `void`, indexed), `quantity` (`DECIMAL(14,3)` > 0), `quantity_delta` (`DECIMAL(14,3)` != 0), `balance_before`, `balance_after`, `unit_cost` (`DECIMAL(12,2)` >= 0), `total_cost` (`DECIMAL(14,2)`), `reference_type`, `reference_code`, `notes`, `created_by_id` (FK -> `accounts_users`, `PROTECT`), `created_at` (indexed)

### `suppliers`, `purchasing_purchases` & `purchasing_purchase_items` (`apps/purchasing/migrations/0001_initial.py`)
- `suppliers`: `id` (PK), `name` (unique, indexed), `contact_name`, `phone` (indexed), `email`, `address`, `is_active`, timestamps
- `purchasing_purchases`: `id` (PK), `purchase_number` (unique, indexed), `supplier_id` (FK -> `suppliers`, `PROTECT`), `status` (`draft` | `ordered` | `received` | `cancelled`, indexed), `purchase_date`, `expected_date`, `subtotal` (`DECIMAL(14,2)`), `discount_amount` (`DECIMAL(14,2)`), `total_amount` (`DECIMAL(14,2)`), `notes`, `created_by`, `received_by`, `received_at`, `cancelled_by`, `cancelled_at`, `cancellation_reason`, timestamps
- `purchasing_purchase_items`: `id` (PK), `purchase_id` (FK `CASCADE`), `product_id` (FK -> `catalog_products`, `PROTECT`), snapshots (`product_sku_snapshot`, `product_name_snapshot`, `unit_abbreviation_snapshot`), `quantity` (`DECIMAL(14,3)` > 0), `unit_cost` (`DECIMAL(12,2)` >= 0), `line_total` (`DECIMAL(14,2)` >= 0), unique `(purchase_id, product_id)`

### `customers`, `sales_sales`, `sales_sale_items` & `sales_payments` (`apps/sales/migrations/0001_initial.py`)
- `customers`: `id` (PK), `name` (indexed), `phone` (indexed), `email`, `address`, `notes`, `is_active`, `created_by`, timestamps
- `sales_sales`: `id` (PK), `sale_number` (unique, indexed), `idempotency_key` (nullable, unique, indexed), `customer_id` (nullable FK -> `customers`, `PROTECT`), `customer_name_snapshot`, `status` (`completed` | `cancelled` | `refunded`, indexed), `subtotal`, `item_discount_total`, `order_discount_type` (`fixed` | `percent`), `order_discount_value`, `order_discount_amount`, `discount_amount` (combined total discount), `tax_amount`, `total_amount`, `paid_amount`, `change_amount` (all `DECIMAL(14,2)` >= 0), `payment_method` (`cash` | `card` | `qr` | `split`, indexed), `notes`, `cashier_id` (`PROTECT`), `cancelled_by`/`cancelled_at`/`cancel_reason`, `refunded_by`/`refunded_at`/`refund_reason`, timestamps
- `sales_sale_items`: `id` (PK), `sale_id` (FK `CASCADE`), `product_id` (FK -> `catalog_products`, `PROTECT`), immutable snapshots (`product_sku_snapshot`, `product_name_snapshot`, `unit_abbreviation_snapshot`, `unit_price`, `unit_cost_snapshot`, `tax_rate_snapshot`), `quantity` (`DECIMAL(14,3)` > 0), `line_subtotal`, `discount_type` (`fixed` | `percent`), `discount_value`, `line_discount`, `line_tax`, `line_total`, unique `(sale_id, product_id)`
- `sales_payments`: `id` (PK), `sale_id` (FK `CASCADE`), `payment_method` (`cash` | `card` | `qr`), `amount` (`DECIMAL(14,2)` > 0), `reference_code`, `created_at`

### `expense_categories` & `expenses` (`apps/expenses/migrations/0001_initial.py`)
- `expense_categories`: `id` (PK), `name` (unique, indexed), `name_km`, `description`, `is_active`, timestamps
- `expenses`: `id` (PK), `expense_number` (unique, indexed), `category_id` (FK -> `expense_categories`, `PROTECT`), `title` (indexed), `amount` (`DECIMAL(14,2)` > 0), `expense_date` (indexed), `payment_method` (`cash` | `bank_transfer` | `card` | `qr` | `other`, indexed), `reference_code` (indexed), `vendor_name`, `notes`, `created_by` (`PROTECT`), `updated_by` (`PROTECT`), timestamps

### `store_settings`, `backup_settings` & `backup_runs` (`apps/store_settings/migrations/0001_initial.py`, `0002_backuprun_backupsetting.py`)
- `store_settings` *(singleton pk=1)*: `id` (PK), `store_name`, `store_name_km`, `tagline`, `phone`, `email`, `address`, `address_km`, `tax_id`, `currency_code`, `currency_symbol`, `exchange_rate_khr` (`DECIMAL(12,2)` > 0), `default_tax_rate` (`DECIMAL(5,2)` 0–100), `receipt_header`, `receipt_footer`, `receipt_footer_km`, `show_khr_on_receipt`, `show_tax_id_on_receipt`, `updated_by` (`PROTECT`), timestamps
- `backup_settings` *(singleton pk=1)*: `id` (PK), `is_enabled`, `cron_expression`, `timezone_name`, `include_database`, `include_media`, `retention_count` (`1–50`), `telegram_enabled`, `telegram_bot_token` (never exposed raw in API responses), `telegram_chat_id`, `telegram_message_thread_id`, `telegram_caption_prefix`, `last_run_at`, `last_status`, `updated_by` (`PROTECT`), timestamps
- `backup_runs`: `id` (PK), `status` (`running` | `success` | `failed`, indexed), `trigger_type` (`manual` | `scheduled`, indexed), `includes_database`, `includes_media`, `file_name`, `file_path`, `file_size_bytes`, `media_files_count`, `telegram_sent`, `telegram_parts_sent`, `telegram_message_id`, `error_message`, `started_at` (indexed), `completed_at`, `triggered_by` (`PROTECT`)
- `accounts_users` (`apps/accounts/migrations/0002_user_avatar.py`): added nullable `avatar` (`ImageField` -> `avatars/%Y/%m/`)

### JWT Blacklist (`rest_framework_simplejwt.token_blacklist`)
- `token_blacklist_outstandingtoken`, `token_blacklist_blacklistedtoken`

## 3. Planned Domain Tables (Not Yet Implemented)

- *(All core POS domain tables implemented; future reporting aggregations query existing transactional tables directly.)*

## 4. Revision Log

| Date | Change | Phase |
| :--- | :--- | :--- |
| 2026-11-23 | Initial schema blueprint established | Phase 0 — Foundation |
| 2026-11-23 | Implemented `accounts_users`, `rbac_permissions`, `rbac_roles`, `audit_logs`, and JWT blacklist migrations | Phase 3 — Auth & RBAC |
| 2026-11-23 | Implemented `catalog_categories` table with `PROTECT` self-FK and bilingual fields | Categories Module |
| 2026-11-23 | Implemented `catalog_units` table with extensible `base_unit` (`PROTECT`) and `DECIMAL(14,6)` `conversion_factor` | Units Module |
| 2026-11-23 | Implemented `catalog_products` table (`DecimalField` prices, `PROTECT` Category/Unit FKs, image upload, no editable stock field) | Products Module |
| 2026-11-23 | Implemented `inventory_stock_balances` & append-only `inventory_stock_movements` ledger with weighted-average valuation | Inventory Module |
| 2026-11-23 | Implemented `suppliers`, `purchasing_purchases`, and `purchasing_purchase_items` with atomic goods receiving | Purchasing Module |
| 2026-11-23 | Implemented `customers`, `sales_sales`, `sales_sale_items`, and `sales_payments` with idempotency, snapshots, and atomic stock integration | POS Checkout & Sales Module |
| 2026-11-23 | Implemented `expense_categories` and `expenses` tables with `PROTECT` category guard and `Decimal` cash-flow tracking | Expenses & Cash Flow Module |
| 2026-11-23 | Implemented singleton `store_settings` table for store identity, USD/KHR exchange rate, default tax, and receipt formatting | Store Settings & Audit Module |
| 2026-11-24 | Added `accounts_users.avatar` (`0002_user_avatar`) and `backup_settings` + `backup_runs` (`0002_backuprun_backupsetting`) for profile images and crontab Telegram backups | Profile Image & Backup Control |
| 2026-11-24 | Added per-item and all-items cash/percentage discount fields to `sales_sales` and `sales_sale_items` (`sales/0002_sale_item_discount_total...`) | POS Checkout Discounts |
| 2026-11-24 | Added `catalog_product_images` (`catalog/0004_productimage`) supporting up to 10 images per product with primary cover selection | Multi-Image Product Gallery |
