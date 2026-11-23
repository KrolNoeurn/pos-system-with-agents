# POS System — Version 2 (V2) Implementation Checklist

> **Created:** 2026-11-24  
> **Baseline:** v1.0 Complete (Phases 0–7 · 11 Django Apps · `62` Backend Tests + `38` Frontend Tests = `100/100` Passing · Zero Deploy/Build Warnings)  
> **Standing Rules:** Follow root `AGENTS.md` — exact `DecimalField` math, `transaction.atomic()`, server-side Django RBAC, `apps.inventory.services` for all stock mutations, append-only audit logs, EN/KM i18n parity (`i18nParity.test.js`), and real verified tests.

---

## Pre-V2 Housekeeping (Recommended First)
- [ ] Commit and tag v1 baseline in Git (`v1.0.0`)
- [ ] Create local `backend/.env`, `frontend/.env`, and bootstrap Super Admin (`manage.py seed_admin`)
- [ ] Add development-only idempotent demo seeder (`manage.py seed_demo`) for quick manual/browser QA

---

## V2.1 — Cash Register Shifts, Held Carts & Thermal Print
**Goal:** Complete daily cashier workflow, drawer accountability, and thermal receipt printing.

### Backend (`apps/shifts`)
- [ ] Create `RegisterShift` (`open`, `closed`, `opening_cash`, `expected_cash`, `counted_cash`, `variance_amount`, `opened_by`, `closed_by`, `opened_at`, `closed_at`, `notes`)
- [ ] Create `CashDrawerMovement` (`cash_in`, `cash_out`, `amount`, `reason`, `created_by`, `created_at`)
- [ ] Add RBAC permissions (`shifts.view`, `shifts.open`, `shifts.close`, `shifts.cash_movement`) to `apps/rbac/constants.py` and re-sync `seed_rbac`
- [ ] Link `Sale` optionally to active `RegisterShift` and compute exact `Decimal` expected cash (`opening_cash + cash_sales - cash_refunds + cash_in - cash_out`)
- [ ] Expose `/api/v1/shifts/` (`open`, `current`, `cash-movement`, `close`, `z-report`) with atomic row locks and audit logs
- [ ] Prevent opening duplicate active shifts per cashier and prevent mutating closed shifts (`409 Conflict`)

### Frontend & UX
- [ ] Build `ShiftsPage.jsx` (`/shifts`) with Open Shift, Cash In/Out, Close Shift (blind count + variance summary), and printable Z-Report modal
- [ ] Add Held / Parked Carts support on `POSCheckoutPage.jsx` (`F4` hold, resume, discard)
- [ ] Add POS keyboard shortcuts (`F2` focus barcode/search, `F8` open payment modal, `Esc` close modal)
- [ ] Add dedicated 80mm thermal `@media print` CSS for `ReceiptModal.jsx` (hiding sidebar/navbar chrome when printing)
- [ ] Add EN/KM translations (`shifts.*`) and pass `i18nParity.test.js`

### Verification & Docs
- [ ] Add backend tests (`apps/shifts/tests/`) and frontend tests (`shifts.test.jsx`)
- [ ] Update `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `RBAC_MATRIX.md`, `DEVELOPMENT_PROGRESS.md`

---

## V2.2 — Multi-Unit Conversion Selling, Wholesale Pricing & Promotions
**Goal:** Activate extensible v1 catalog fields (`base_unit`, `conversion_factor`, `wholesale_price`) and add promotional pricing rules.

### Backend (`apps/catalog`, `apps/sales`, `apps/purchasing`)
- [ ] Enable unit-aware quantity conversion to base units in `apps/sales/services.py` and `apps/purchasing/services.py` using `Unit.base_unit` and `Unit.conversion_factor` (`Decimal`)
- [ ] Add authorized `price_tier` (`retail` | `wholesale`) on POS checkout using `Product.wholesale_price` (server-side validation & RBAC)
- [ ] Add `Promotion` / `Coupon` model (percentage or fixed discount, date window, min spend, active toggle, usage limit) validated server-side during checkout

### Frontend & UX
- [ ] Add unit selector on POS cart lines & Purchase Order items when derived units exist
- [ ] Add Retail / Wholesale price toggle on `POSCheckoutPage.jsx` (permission-gated)
- [ ] Add promo/coupon code input at POS checkout and Promotions management tab
- [ ] Add EN/KM translations and verify `i18nParity.test.js`

### Verification & Docs
- [ ] Test base-unit stock deduction/receiving math, wholesale price authority, and expired/over-limit coupon rejection
- [ ] Update docs and `DEVELOPMENT_PROGRESS.md`

---

## V2.3 — Partial Receiving, Supplier Payables & Partial Refunds
**Goal:** Handle multi-shipment deliveries, supplier invoice balances, and line-item customer returns.

### Backend (`apps/purchasing`, `apps/sales`)
- [ ] Add `PurchaseReceipt` and `PurchaseReceiptItem` models + `PurchaseItem.received_quantity` and `Purchase.Status.PARTIALLY_RECEIVED`
- [ ] Prevent over-receiving beyond ordered quantity (`400`/`409`) and update inventory strictly via `inventory.services` per receipt
- [ ] Add `SupplierPayment` tracking (`unpaid`, `partial`, `paid`) integrated with Cash Flow Summary
- [ ] Add `SaleRefund` & `SaleRefundItem` models supporting partial/line-item refunds (`POST /api/v1/sales/{id}/partial-refund/`) with exact prorated tax/discount calculation and anti-over-refund guards

### Frontend & UX
- [ ] Add partial receive quantity inputs per PO line in `PurchasingPage.jsx` + receiving history list
- [ ] Add Supplier Payment modal and payment status badges on Purchase History
- [ ] Add item-level Refund modal in `SalesPage.jsx` showing remaining refundable quantities
- [ ] Add EN/KM translations and verify `i18nParity.test.js`

### Verification & Docs
- [ ] Test multi-shipment PO receiving, over-receive prevention, partial refunds, and cumulative refund cap
- [ ] Update docs and `DEVELOPMENT_PROGRESS.md`

---

## V2.4 — Visual Analytics, Barcode Label Printing & Dynamic KHQR
**Goal:** Improve executive visibility and Cambodian retail checkout polish.

### Backend & Frontend
- [ ] Add time-series aggregation endpoint (`/api/v1/reports/trends/?period=7d|30d|12m`) returning daily/monthly Sales, Gross Profit, and Operating Expenses
- [ ] Add lightweight responsive charts to `HomePage.jsx` and `ReportsPage.jsx` (respecting Light & Dark themes)
- [ ] Add Printable Barcode Sticker Sheet view/modal on `ProductsPage.jsx` (SKU, barcode SVG, EN/KM name, selling price, copy count)
- [ ] Add Bakong KHQR payload & scannable QR code rendering in `POSCheckoutPage.jsx` Payment Modal when `QR / KHQR` is selected (configured via `StoreSetting`)
- [ ] Add EN/KM translations, tests, and documentation updates

---

## V2.5 — DevOps, Security Hardening & Offline-Resilient POS
**Goal:** Production automation, brute-force protection, and network resilience.

### Security & Infrastructure
- [ ] Add DRF `ScopedRateThrottle` on `/api/v1/auth/login/` and `/api/v1/auth/refresh/` to prevent brute-force attacks
- [ ] Add optional TOTP 2FA enrollment/verification for Super Admin & Manager accounts
- [ ] Add production `backend/Dockerfile`, `frontend/Dockerfile`, `nginx.conf`, and `docker-compose.yml` (Django + Gunicorn + Nginx + PostgreSQL 16)
- [ ] Add GitHub Actions CI workflow (`.github/workflows/ci.yml`) running `makemigrations --check`, `check --deploy`, all backend tests, all frontend tests, and `vite build`
- [ ] Add automated PostgreSQL backup/restore scripts and operational runbook in `docs/`

### Offline POS Resilience (Optional PWA)
- [ ] Add Service Worker + IndexedDB catalog snapshot and offline sale queue using existing `idempotency_key` for safe automatic replay on reconnect

---

## V2.6 — Multi-Branch & Inter-Branch Stock Transfers *(When Scaling Beyond 1 Store)*
**Goal:** Support multiple retail stores and central warehouses.

### Backend & Frontend
- [ ] Create `Branch` model (`apps/branches`) and user-branch permission scoping
- [ ] Scope `StockBalance`, `StockMovement`, `Sale`, `Purchase`, `Expense`, and `RegisterShift` by `branch` (with safe data migration defaulting existing records to Main Branch)
- [ ] Build atomic `StockTransfer` workflow (`draft` → `in_transit` → `received` / `cancelled`) deducting source branch and crediting destination branch via `inventory.services`
- [ ] Add Branch selector in top header (`AppShell`) and HQ Consolidated vs. Single-Branch reporting toggle
- [ ] Full multi-branch RBAC isolation tests, EN/KM translations, and documentation updates
