# Development Roadmap

> **Status:** Phase 0 Complete — Ready for Phase 1 upon Approval

## Phase 0 — Workspace Foundation (Completed)
- [x] Establish root `AGENTS.md` workspace instructions
- [x] Establish all seven Antigravity workspace skills under `.agents/skills/`
- [x] Create project documentation structure under `docs/`

## Phase 1 — Project Scaffolding & Core Infrastructure (Next)
- [ ] Initialize Django + DRF backend in `backend/` with modular app layout, settings split, and SQLite setup
- [ ] Initialize React + Vite + Bootstrap 5 frontend in `frontend/` with feature folders and Axios client
- [ ] Set up design tokens, Light/Dark themes, English/Khmer i18n scaffolding, and Vertical/Horizontal layout shells
- [ ] Configure automated test runners for backend and frontend

## Phase 2 — Authentication, RBAC & Audit Logging
- [ ] Implement custom User model, JWT login/refresh/logout, and `/api/v1/auth/me/`
- [ ] Implement Roles, Permissions (`<module>.<action>`), role assignments, and DRF RBAC permission classes
- [ ] Implement anti-escalation protections and append-only `audit` app
- [ ] Build React login flow, protected routes, permission-aware navigation, and User/Role management screens

## Phase 3 — Catalog & Inventory Management
- [ ] Implement Categories, Units, and Products (SKU/barcode search, pricing, tax rates)
- [ ] Implement Inventory stock balances, append-only stock movement ledger, and manual adjustments
- [ ] Build Catalog & Inventory management UI with server-side search, filters, and pagination

## Phase 4 — POS Checkout & Sales Operations
- [ ] Implement atomic Checkout service (`Decimal` calculations, stock deduction, payment records, idempotency)
- [ ] Implement authorized Sale Cancellation and Refund services with stock restoration and audit logs
- [ ] Build cashier-optimized POS checkout screen, payment modal, and printable receipt view
- [ ] Build Sales history, detail, cancellation, and refund views

## Phase 5 — Customers, Suppliers, Purchasing & Expenses
- [ ] Implement Customer and Supplier directories
- [ ] Implement Purchase Orders and Goods Receiving (updating stock via `inventory.services`)
- [ ] Implement Expense Categories and Expense Tracking

## Phase 6 — Dashboard, Reports & Store Settings
- [ ] Implement Store Settings (store profile, currency, default tax, receipt formatting)
- [ ] Implement Dashboard KPIs and Sales/Inventory/Profit & Loss reports with export (`reports.export`)
- [ ] Complete Khmer (`km`) and English (`en`) translation audit across all screens

## Phase 7 — Hardening & Production Readiness
- [ ] End-to-end POS transaction, financial precision, and RBAC security regression audit
- [ ] PostgreSQL compatibility verification and deployment checklist
