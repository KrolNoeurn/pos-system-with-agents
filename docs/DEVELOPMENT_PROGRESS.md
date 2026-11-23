# Development Progress

> **Last Updated:** 2026-11-23  
> **Current Phase:** Phase 7 Complete — Production Hardening, Full Regression Suite & Deployment Readiness Verified (100/100 Automated Tests Passing)

## Completed Milestones

### Phase 0 — Workspace Foundation
- Root `AGENTS.md`, seven Antigravity workspace skills under `.agents/skills/` (with `references/`), and all nine `docs/*.md` files established and validated.

### Phase 2 — Project Initialization
- Initialized Django + DRF backend (`backend/`) with SQLite, split settings (`base`, `dev`, `prod`), CORS, and `/api/v1/health/`.
- Initialized React + Vite + Bootstrap 5 frontend (`frontend/`) with centralized Axios client, React Router, ErrorBoundary, `.env.example`, `.gitignore`, and `README.md`.

### Phase 3 — Authentication & RBAC
- Implemented custom `accounts.User`, `rbac.Permission` (39 canonical permissions), `rbac.Role` (5 protected system roles), append-only `audit.AuditLog`, JWT auth with rotation/blacklist, anti-privilege-escalation services, and frontend Auth/Users/Roles/Profile UI.

### Phase 4 — POS UI Framework
- Implemented centralized design tokens (`tokens.css`), `themeConfig.js`, `navigation.js`, English/Khmer `translations.js`, `PreferencesContext`, `ToastContext`, `ConfirmContext`, shared `AppShell` (`VerticalLayout` & `HorizontalLayout` wrapping `<Outlet />`), and reusable `components/ui/` primitives.

### Catalog — Categories, Units & Products
- Implemented `Category`, `Unit` (extensible `base_unit` + `Decimal` `conversion_factor`), and `Product` (`DecimalField` prices, Pillow `ImageField`, `PROTECT` FKs, `products.edit_price` guard, no editable stock field) across `apps/catalog` and React UI (`CategoriesPage`, `UnitsPage`, `ProductsPage`).

### Inventory Management (`apps/inventory`)
- **Backend (`backend/apps/inventory/`):**
  - Created `StockBalance` (read-only synchronized cache with `quantity_on_hand` & weighted moving `average_unit_cost`) and append-only `StockMovement` ledger (`opening`, `stock_in`, `stock_out`, `adjustment`, plus reserved `sale`, `purchase`, `refund`, `void` types; `PROTECT` FK to `Product` & `User`; DB check constraints).
  - Built atomic, row-locked (`select_for_update`) service layer (`record_stock_movement`, `record_opening_stock`, `record_stock_in`, `record_stock_out`, `record_stock_adjustment`, `get_inventory_valuation_report`) enforcing:
    - Traceable immutable movements with `balance_before`, `quantity_delta`, `balance_after`, `unit_cost`, `total_cost`, `reference_type/code`, `notes`, `created_by`, and `created_at`.
    - Configurable negative-stock prevention (`INVENTORY_ALLOW_NEGATIVE_STOCK=False` default), `unit.allow_decimal` checks, one-time opening stock (`409` on duplicate), mandatory notes on adjustments, moving-average stock valuation, and atomic audit logs.
    - Real DB `PROTECT` delete guard: any `Product` with inventory movements returns `409 Conflict` on delete.
  - Exposed read-only `/api/v1/inventory/balances/`, `/low-stock/`, `/movements/`, `/report/` (`inventory.view` / `reports.view`) and controlled movement endpoints `/opening-stock/`, `/stock-in/`, `/stock-out/`, `/adjustments/` (`inventory.adjust`). Arbitrary balance editing returns `405 Method Not Allowed`.
- **Frontend (`frontend/src/`):**
  - Added `inventoryService.js`, Inventory -> Stock & Movements navigation item (`inventory.view`), lazy `/inventory` route, complete EN/KM translations (`inventory.*`), and `InventoryPage.jsx` with 4 tabs (Stock Balances, Movement History, Low-Stock Alerts with count badge, Valuation Report) and controlled movement modals gated by `inventory.adjust`.
- **Documentation Updated:** `docs/DATABASE_SCHEMA.md`, `docs/API_DOCUMENTATION.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_PROGRESS.md`, and `backend/.env.example`.

### Purchasing & Goods Receiving (`apps/purchasing`)
- **Backend (`backend/apps/purchasing/`):**
  - Created `Supplier` (`db_table="suppliers"`), `Purchase` (`db_table="purchasing_purchases"`, statuses `draft`, `ordered`, `received`, `cancelled`, server-calculated `DecimalField` `subtotal`, `discount_amount`, `total_amount`, DB `CheckConstraint`s, and audit actor/timestamp fields), and `PurchaseItem` (`db_table="purchasing_purchase_items"`, `PROTECT` FK to `Product`, SKU/name/unit snapshots, unique `(purchase, product)`, DB `CheckConstraint`s).
  - Built atomic service layer (`services.py`) enforcing:
    - Creating or editing a `draft`/`ordered` purchase **never** mutates inventory balances.
    - `receive_purchase` locks the purchase row (`select_for_update()`), blocks duplicate receiving or receiving cancelled orders (`409 Conflict` via `PurchaseStateError`), and calls `apps.inventory.services.record_stock_movement` (`movement_type="purchase"`) for every item inside a single `transaction.atomic()` block alongside audit logging.
    - `cancel_purchase` blocks cancelling already-received purchases (`409 Conflict`) and preserves purchase history (no `DELETE` endpoint).
    - Strict validation for positive quantities respecting `product.unit.allow_decimal`, non-negative `Decimal` unit costs, duplicate product lines, and `0 <= discount_amount <= subtotal`.
    - Real DB `PROTECT` delete guard: any `Product` referenced by a `PurchaseItem` returns `409 Conflict` on delete.
  - Exposed `/api/v1/suppliers/` (`suppliers.view`, `suppliers.create`, `suppliers.edit`) and `/api/v1/purchases/` (`purchases.view`, `purchases.create`) plus `/receive/` (`purchases.receive`) and `/cancel/` (`purchases.cancel`).
- **Frontend (`frontend/src/`):**
  - Added `purchasingService.js`, Purchasing -> Purchases & Receiving navigation item (`purchases.view`), lazy `/purchasing` route, complete EN/KM translations (`nav.purchasing`, `nav.purchases`, `purchasing.*`), and `PurchasingPage.jsx` with Purchase History & Suppliers tabs, search/supplier/status filters, pagination, Purchase Detail modal, Create/Edit Purchase modal with dynamic item builder & live preview totals + draft non-stock notice, Supplier Create/Edit modal, confirmation dialogs for Receive Goods and Cancel Purchase, and RBAC permission gating.
- **Documentation Updated:** `docs/DATABASE_SCHEMA.md`, `docs/API_DOCUMENTATION.md`, `docs/ARCHITECTURE.md`, and `docs/DEVELOPMENT_PROGRESS.md`.

### POS Checkout, Sales History & Customers (`apps/sales`)
- **Backend (`backend/apps/sales/`):**
  - Created `Customer` (`db_table="customers"`), `Sale` (`db_table="sales_sales"`, statuses `completed`, `cancelled`, `refunded`; payment methods `cash`, `card`, `qr`, `split`; unique `sale_number` & `idempotency_key`; server-calculated `DecimalField` `subtotal`, `discount_amount`, `tax_amount`, `total_amount`, `paid_amount`, `change_amount`; audit actor/timestamp/reason fields), `SaleItem` (`db_table="sales_sale_items"`, `PROTECT` FK to `Product`, SKU/name/unit/price/cost/tax snapshots), and `SalePayment` (`db_table="sales_payments"` supporting single and split tenders).
  - Built atomic service layer (`services.py`) enforcing:
    - Authoritative server-side `Decimal` pricing (ignoring any client-supplied unit prices/totals), proportional discount allocation before tax, and exact change calculation.
    - Server-side `sales.discount` permission enforcement whenever `discount_amount > 0` (`403 Forbidden` otherwise).
    - Checkout idempotency via `idempotency_key` / `X-Idempotency-Key` (replays return `200 OK` without double-charging or double-deducting stock).
    - Atomic stock deduction via `apps.inventory.services.record_stock_movement(..., movement_type="sale")` inside `transaction.atomic()` — insufficient stock on any line rolls back the entire sale cleanly.
    - Atomic `cancel_sale` (`VOID`) and `refund_sale` (`REFUND`) restoring stock once via `inventory.services`, requiring a reason, blocking duplicate voids/refunds (`409 Conflict`), and recording audit logs.
    - Immutable completed sales (no `PUT`/`PATCH`/`DELETE` endpoints) and `PROTECT` delete guard on sold products (`409 Conflict`).
  - Exposed `/api/v1/customers/`, `/api/v1/sales/catalog/`, `/api/v1/sales/`, `/api/v1/sales/{id}/`, `/api/v1/sales/{id}/cancel/`, and `/api/v1/sales/{id}/refund/`.
- **Frontend (`frontend/src/`):**
  - Added `salesService.js`, `utils/apiError.js`, `components/sales/ReceiptModal.jsx`, `POSCheckoutPage.jsx` (`/pos`), `SalesPage.jsx` (`/sales` with Sales History & Customers tabs), navigation (`POS & Sales`), lazy RBAC-protected routes, and full EN/KM translations (`sales.*`).
  - Cashier-optimized POS Checkout supports barcode/SKU Enter-key quick add, category filter pills, live stock availability badges, cart quantity controls (respecting decimal units), quick customer creation, permission-gated discounts, Cash/Card/QR/Split payment modal with change calculation & double-submit idempotency protection, and printable receipts.
- **Documentation Updated:** `docs/DATABASE_SCHEMA.md`, `docs/API_DOCUMENTATION.md`, `docs/ARCHITECTURE.md`, and `docs/DEVELOPMENT_PROGRESS.md`.

### Expenses & Cash Flow Tracking (`apps/expenses`)
- **Backend (`backend/apps/expenses/`):**
  - Created `ExpenseCategory` (`db_table="expense_categories"`, unique name, optional Khmer `name_km`, `PROTECT` delete guard) and `Expense` (`db_table="expenses"`, sequential `expense_number` `EXP-YYYYMMDD-XXXX`, exact `DecimalField` `amount > 0`, `expense_date`, `payment_method` `cash`/`bank_transfer`/`card`/`qr`/`other`, `vendor_name`, `reference_code`, `notes`, audit actors/timestamps).
  - Built service layer (`services.py`) enforcing duplicate category prevention, active-category checks, `409 Conflict` delete protection for categories in use, full audit logging on create/edit/delete (retaining deleted expense snapshots in `AuditLog`), and exact `Decimal` `get_cash_flow_summary` combining completed Sales inflows, received Purchasing outflows, and Operating Expenses with category and payment-method breakdowns.
  - Exposed `/api/v1/expense-categories/`, `/api/v1/expenses/`, and `/api/v1/expenses/summary/` gated by `expenses.view/create/edit/delete` (and `reports.view` on read-only categories/summary).
- **Frontend (`frontend/src/`):**
  - Added `expensesService.js`, `Finance -> Expenses & Cash Flow` navigation (`/expenses`, `expenses.view`), lazy route, full EN/KM translations (`expenses.*`), and `ExpensesPage.jsx` with 3 tabs (`Expenses`, `Cash Flow Summary`, `Expense Categories`), search/category/payment/date filters, confirmation dialogs, and RBAC permission gating.
- **Documentation Updated:** `docs/DATABASE_SCHEMA.md`, `docs/API_DOCUMENTATION.md`, `docs/ARCHITECTURE.md`, and `docs/DEVELOPMENT_PROGRESS.md`.

### Store Settings & Audit Log Viewer (`apps/store_settings`, `apps/audit`)
- **Backend (`backend/apps/store_settings/`, `backend/apps/audit/`):**
  - Created singleton `StoreSetting` model (`db_table="store_settings"`, pk=1) storing store identity (EN/KM), contact info, VAT TIN, currency code/symbol, USD->KHR exchange rate (`DECIMAL(12,2)` > 0), default tax rate (`0–100%`), receipt header/footer (EN/KM), and receipt display toggles (`show_khr_on_receipt`, `show_tax_id_on_receipt`).
  - Built atomic `update_store_settings` service with row locking (`select_for_update`), validation, and `settings.updated` audit trail logging.
  - Exposed `/api/v1/settings/` (`settings.view` / `settings.edit`) and non-sensitive `/api/v1/settings/receipt-profile/` (`IsActiveAuthenticated` for cashier receipt rendering).
  - Enhanced read-only `/api/v1/audit-logs/` (`audit.view`) with `search`, `action`, `target_type`, `actor`, `date_from`, and `date_to` filters while remaining strictly append-only (`405` on POST/DELETE).
- **Frontend (`frontend/src/`):**
  - Added `settingsService.js`, `auditService.js`, `Administration -> Store Settings` (`/settings`, `settings.view`) and `Administration -> Audit Logs` (`/audit-logs`, `audit.view`), lazy routes, and full EN/KM translations (`settings.*`, `audit.*`).
  - Built `SettingsPage.jsx` with Store Identity, Currency & Tax, Receipt Formatting, Live Receipt Preview (including KHR conversion), and read-only mode when `settings.edit` is absent.
  - Built `AuditLogsPage.jsx` with search, target-type/date filters, pagination, and formatted JSON metadata inspection modal.
  - Connected `ReceiptModal.jsx` dynamically to `/api/v1/settings/receipt-profile/` so printed receipts reflect live store branding, VAT TIN, KHR conversion, and bilingual header/footer.
- **Documentation Updated:** `docs/DATABASE_SCHEMA.md`, `docs/API_DOCUMENTATION.md`, `docs/ARCHITECTURE.md`, and `docs/DEVELOPMENT_PROGRESS.md`.

### Dashboard KPIs & Financial/Inventory Reports (`apps/reports`)
- **Backend (`backend/apps/reports/`):**
  - Built exact `Decimal` analytics service layer (`services.py`) with zero N+1 queries:
    - `get_dashboard_summary` (`dashboard.view`): today's sales/orders/avg ticket, MTD sales & expenses, pending POs, low/out-of-stock counts, last 5 receipts, and top 5 low-stock products.
    - `get_sales_report` (`reports.view`): completed/cancelled/refunded counts, gross subtotal, discounts, tax, net revenue, average order value, daily breakdown, payment breakdown, and top-15 products with COGS and gross profit.
    - `get_profit_and_loss_report` (`reports.view`): exact `Decimal` P&L (gross/net sales, COGS from `SaleItem.unit_cost_snapshot`, gross profit/margin %, operating expenses, net profit/margin %, received POs cash-flow context, and expense category breakdown).
    - `get_purchasing_report` (`reports.view`): PO status breakdown and received spend by supplier.
    - `build_report_csv` (`reports.export`): sanitized CSV downloads (neutralizing spreadsheet formula injection) for `sales`, `pnl`, `inventory`, and `purchasing`, recording `report.exported` in `AuditLog`.
  - Exposed `/api/v1/reports/dashboard/`, `/api/v1/reports/sales/`, `/api/v1/reports/profit-loss/`, `/api/v1/reports/purchasing/`, and `/api/v1/reports/export/`.
- **Frontend (`frontend/src/`):**
  - Added `reportsService.js`, `Finance -> Reports & Analytics` (`/reports`, `reports.view`), lazy route, and complete EN/KM translations (`dashboard.*`, `reports.*`).
  - Upgraded `HomePage.jsx` with live Dashboard KPI cards, recent sales, low-stock alerts, and quick links (`Open POS`, `Reports`) gated by `dashboard.view`, while retaining Backend Health Check, Session Scope, and UI Preferences.
  - Built `ReportsPage.jsx` with 4 tabs (`Profit & Loss`, `Sales Report`, `Inventory Valuation`, `Purchasing Report`), date range filters & quick presets (`Today`, `This Month`, `All Time`), and RBAC-gated `Export CSV` button (`reports.export`).
- **Documentation Updated:** `docs/API_DOCUMENTATION.md`, `docs/ARCHITECTURE.md`, and `docs/DEVELOPMENT_PROGRESS.md`.

### Phase 7 — Production Hardening, Regression Audit & Deployment Readiness
- **Backend Production Hardening (`backend/config/settings/prod.py`, `backend/.env.example`):**
  - Enforced strong `DJANGO_SECRET_KEY` (`>= 50` chars, no placeholder), explicit `DJANGO_ALLOWED_HOSTS` (no `*`), HTTPS/HSTS (`SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS=31536000`, `SECURE_HSTS_INCLUDE_SUBDOMAINS`, `SECURE_HSTS_PRELOAD`, `SECURE_PROXY_SSL_HEADER`), `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_HTTPONLY`, `CSRF_COOKIE_SECURE`, `CSRF_TRUSTED_ORIGINS`, `SECURE_CONTENT_TYPE_NOSNIFF`, `SECURE_REFERRER_POLICY`, `X_FRAME_OPTIONS="DENY"`, and `STATIC_ROOT`.
  - Added environment-driven PostgreSQL production configuration (`DB_ENGINE=postgresql`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_CONN_MAX_AGE`, `DB_SSLMODE`).
- **Frontend Bundle & Bilingual QA (`frontend/vite.config.js`, `frontend/src/__tests__/i18nParity.test.js`):**
  - Configured Rollup `manualChunks` (`react-vendor`, `router-vendor`, `bootstrap-vendor`, `http-vendor`, `vendor`), eliminating all Vite `> 500 kB` chunk warnings.
  - Added permanent automated `i18nParity.test.js` guaranteeing 100% key parity and non-empty strings across English (`en`) and Khmer (`km`) dictionaries.
- **Documentation Finalized:** Updated `README.md`, `docs/ROADMAP.md`, and `docs/DEVELOPMENT_PROGRESS.md`.

## Observed Verification Results (Full Final Audit)

- `backend/.venv/bin/python backend/manage.py makemigrations --check --dry-run` — **PASS** (`No changes detected`).
- `DJANGO_SETTINGS_MODULE=config.settings.prod ... manage.py check --deploy` — **PASS** (`System check identified no issues (0 silenced)` with >= 50-char secret).
- `backend/.venv/bin/python backend/manage.py test apps -v 2` — **PASS** (**`62/62` backend tests passed** in `178.813s` across `accounts`, `audit`, `catalog`, `core`, `expenses`, `inventory` including multi-threaded concurrency, `purchasing`, `rbac`, `reports`, `sales`, and `store_settings`).
- `npm --prefix frontend test` (`vitest run`) — **PASS** (**`38/38` frontend tests passed** across 11 files, including `i18nParity.test.js`).
- `npm --prefix frontend run build` (`vite build`) — **PASS** (built in `6.09s` with **zero warnings**; largest chunk `react-vendor` at `219.58 kB` / `68.04 kB` gzip, app entry `index` at `99.13 kB` / `25.46 kB` gzip).

## Status

- All v1 POS phases (Phases 0–7) are complete and production-ready (`100/100` automated backend + frontend tests passing).
