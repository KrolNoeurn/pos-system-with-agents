# Project Overview — POS System

> **Status:** Phase 0 — Workspace Foundation Complete (Application Scaffolding Pending)

## 1. Purpose & Vision

The **POS System** is a professional, modular Point of Sale web application built for retail store operations. It provides fast, accurate cashier checkout, real-time inventory tracking, purchasing and expense tracking, financial reporting, granular Role-Based Access Control (RBAC), bilingual English/Khmer support, and flexible Vertical/Horizontal workspace layouts.

## 2. Target Users & Roles

- **Super Administrator:** Full system configuration, role/permission governance, user administration, and audit oversight.
- **Store Manager:** Product/catalog management, pricing, stock oversight, sales refunds/cancellations, purchases, expenses, and financial reports.
- **Cashier:** High-speed POS checkout, product search/barcode scanning, cart management, permitted discounts, payment processing, and receipt printing.
- **Inventory Clerk:** Stock receiving, purchase order intake, inventory counts, and permitted stock adjustments.
- **Accountant / Auditor (Read-Oriented):** Sales, expense, tax, and inventory reporting plus read-only audit review.

## 3. Core Capabilities (Planned Scope)

- **Authentication & RBAC:** JWT-based login/refresh/logout, user lifecycle management, custom roles, canonical `<module>.<action>` permissions, and security audit logs.
- **Catalog & Inventory:** Categories, units of measure, products with barcodes/SKUs, stock balances, stock movement ledger, low-stock alerts, and controlled adjustments.
- **POS Checkout & Sales:** Fast barcode/search checkout screen, cart controls, discounts, tax computation, multiple payment methods, change calculation, receipt printing, authorized cancellations, and refunds.
- **Purchasing & Expenses:** Suppliers, purchase orders, stock receiving, expense categories, and operational expense entries.
- **Customers & Dashboard:** Customer directory, sales history, KPI dashboard, and exportable operational reports.
- **Internationalization & UX:** English (`en`) and Khmer (`km`) UI switching, Light and Dark themes, and Vertical (sidebar) / Horizontal (top-nav) layout switching.

## 4. Technology Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | React, Vite, Bootstrap 5, Bootstrap Icons, React Router, Axios, React Context API, React Hook Form |
| Backend | Python, Django, Django REST Framework (DRF) |
| Database | SQLite (initial development), PostgreSQL-compatible schema & ORM design |
| Authentication | JWT (access + refresh tokens) |
| Authorization | Server-side RBAC in Django (mirrored in React UX only) |
| Languages | English (`en`), Khmer (`km`) |

## 5. Documentation Map

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture, directory boundaries, and module map
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — Planned data model, constraints, and financial integrity rules
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) — `/api/v1/` conventions, authentication, and planned endpoints
- [RBAC_MATRIX.md](./RBAC_MATRIX.md) — Roles, canonical permissions, and access matrix
- [UI_DESIGN_GUIDELINES.md](./UI_DESIGN_GUIDELINES.md) — Design tokens, layouts, themes, Khmer typography, POS UX
- [ROADMAP.md](./ROADMAP.md) — Phased implementation roadmap
- [DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md) — Live status tracker, completed milestones, and next tasks
- [DECISIONS.md](./DECISIONS.md) — Architecture Decision Records (ADRs)
