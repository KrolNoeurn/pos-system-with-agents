# Development Roadmap

> **Status:** All v1 Phases Complete (Phases 0–7 Implemented & Verified)

## Phase 0 — Workspace Foundation (Completed)
- [x] Establish root `AGENTS.md` workspace instructions
- [x] Establish all seven Antigravity workspace skills under `.agents/skills/`
- [x] Create project documentation structure under `docs/`

## Phase 1 — Project Scaffolding & Core Infrastructure (Completed)
- [x] Initialize Django + DRF backend in `backend/` with modular app layout, settings split (`base`/`dev`/`prod`), and SQLite setup
- [x] Initialize React + Vite + Bootstrap 5 frontend in `frontend/` with feature folders and Axios client
- [x] Set up design tokens, Light/Dark themes, English/Khmer i18n scaffolding, and Vertical/Horizontal layout shells
- [x] Configure automated test runners for backend (`manage.py test`) and frontend (`vitest`)

## Phase 2 — Authentication, RBAC & Audit Logging (Completed)
- [x] Implement custom User model, JWT login/refresh/logout, and `/api/v1/auth/me/`
- [x] Implement Roles, Permissions (`<module>.<action>`), role assignments, and DRF RBAC permission classes
- [x] Implement anti-escalation protections and append-only `audit` app
- [x] Build React login flow, protected routes, permission-aware navigation, and User/Role management screens

## Phase 3 — Catalog & Inventory Management (Completed)
- [x] Implement Categories, Units, and Products (SKU/barcode search, pricing, tax rates, images)
- [x] Implement Inventory stock balances, append-only stock movement ledger, weighted-average valuation, and manual adjustments
- [x] Build Catalog & Inventory management UI with server-side search, filters, and pagination

## Phase 4 — POS Checkout & Sales Operations (Completed)
- [x] Implement atomic Checkout service (`Decimal` calculations, stock deduction, payment records, idempotency)
- [x] Implement authorized Sale Cancellation and Refund services with stock restoration and audit logs
- [x] Build cashier-optimized POS checkout screen, payment modal, and printable receipt view
- [x] Build Sales history, detail, cancellation, and refund views

## Phase 5 — Customers, Suppliers, Purchasing & Expenses (Completed)
- [x] Implement Customer and Supplier directories
- [x] Implement Purchase Orders and Goods Receiving (updating stock via `inventory.services`)
- [x] Implement Expense Categories, Expense Tracking, and Cash Flow Summary

## Phase 6 — Dashboard, Reports & Store Settings (Completed)
- [x] Implement Store Settings (store profile, currency/KHR rate, default tax, receipt formatting + live receipt integration) and Audit Log Viewer
- [x] Implement Dashboard KPIs and Sales/Profit & Loss/Inventory/Purchasing reports with audited CSV export (`reports.export`)
- [x] Complete automated English (`en`) and Khmer (`km`) translation key parity verification across all screens

## Phase 7 — Hardening & Production Readiness (Completed)
- [x] End-to-end POS transaction, financial precision, concurrency, and RBAC security full regression suite
- [x] PostgreSQL production configuration (`prod.py`), `manage.py check --deploy` audit, Vite vendor chunk optimization, and deployment checklist
