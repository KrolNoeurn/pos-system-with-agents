# System Architecture

> **Status:** Phase 4 Complete — Auth & RBAC + Reusable POS UI Framework (Vertical/Horizontal Layouts, Themes, UI Primitives) Implemented; Business Modules Pending

## 1. High-Level Architecture

The POS System uses a decoupled two-tier web architecture:

```text
+-----------------------------------+        HTTPS / JSON (/api/v1/)        +------------------------------------+
|        React + Vite SPA           | <-----------------------------------> |     Django + DRF REST Backend      |
|  Bootstrap 5 | AppShell | Contexts|      CORS + JWT Bearer Auth           |  Modular Apps | Services | RBAC    |
+-----------------------------------+                                       +------------------------------------+
                                                                                              |
                                                                                              v
                                                                            +------------------------------------+
                                                                            |  SQLite (Dev) / PostgreSQL (Prod)  |
                                                                            +------------------------------------+
```

- **Frontend (`frontend/`):** React + Vite + Bootstrap 5 SPA with centralized Axios JWT + refresh-retry interceptor, `AuthContext`, `PreferencesContext` (theme/layout/sidebar/language), `ToastContext`, `ConfirmContext`, shared `AppShell` (`VerticalLayout` & `HorizontalLayout` wrapping `<Outlet />`), centralized permission-aware `navigation.js`, and reusable `components/ui/` library.
- **Backend (`backend/`):** Django + DRF REST API serving `/api/v1/` with JWT authentication (`djangorestframework-simplejwt` with rotation & blacklist), default-deny `IsActiveAuthenticated`, `<module>.<action>` RBAC permissions, anti-privilege-escalation services, and append-only audit logs.

## 2. Current & Planned Repository Structure

```text
pos-system/
├── AGENTS.md                   # Primary workspace instructions
├── README.md                   # Developer setup and run guide
├── .env.example / .gitignore   # Root environment reference & ignore rules
├── .agents/skills/             # Workspace Agent Skills
├── docs/                       # Architecture, schema, API, RBAC, UI, roadmap, ADRs
├── backend/                    # Django + DRF project
│   ├── manage.py / requirements.txt / .env.example
│   ├── config/
│   │   ├── urls.py / asgi.py / wsgi.py
│   │   └── settings/{base.py, dev.py, prod.py}
│   └── apps/
│       ├── core/               # [Implemented] Health service, /api/v1/health/, tests
│       ├── audit/              # [Implemented] Append-only AuditLog model, sanitizer, /api/v1/audit-logs/
│       ├── rbac/               # [Implemented] Permission & Role models, seed_rbac, anti-escalation services, DRF permissions
│       ├── accounts/           # [Implemented] Custom User model, JWT auth, profile, password change, user admin APIs, seed_admin
│       ├── catalog/            # [Implemented] Category, Unit & Product models, services, /api/v1/categories/, /api/v1/units/, /api/v1/products/, tests
│       ├── inventory/          # [Implemented] StockBalance & append-only StockMovement ledger, atomic services, valuation report, /api/v1/inventory/, tests
│       ├── purchasing/         # [Implemented] Supplier, Purchase, PurchaseItem, atomic goods receiving via inventory services, /api/v1/suppliers/, /api/v1/purchases/, tests
│       ├── sales/              # [Implemented] Customer, Sale, SaleItem, SalePayment, idempotent atomic checkout, cancel/refund stock restoration, /api/v1/customers/, /api/v1/sales/, tests
│       ├── expenses/           # [Implemented] ExpenseCategory, Expense, audited CRUD, exact Decimal cash-flow summary, /api/v1/expense-categories/, /api/v1/expenses/, tests
│       ├── store_settings/     # [Implemented] Singleton StoreSetting model, audited updates, /api/v1/settings/, /api/v1/settings/receipt-profile/, tests
│       └── reports/            # [Implemented] Dashboard KPIs, Sales, Profit & Loss, Purchasing reports, audited CSV export, /api/v1/reports/, tests
└── frontend/                   # React + Vite project
    ├── index.html / package.json / vite.config.js / .env.example
    └── src/
        ├── main.jsx / App.jsx
        ├── app/router.jsx      # Lazy-loaded, protected & permission-aware React Router table
        ├── config/             # themeConfig.js, navigation.js (menus + breadcrumbs)
        ├── i18n/               # translations.js (English & Khmer UI dictionary)
        ├── contexts/           # AuthContext, PreferencesContext, ToastContext, ConfirmContext
        ├── layouts/            # AppShell, VerticalLayout, HorizontalLayout, Breadcrumbs, HeaderControls
        ├── components/         # ErrorBoundary, StatusAlert, ProtectedRoute, ui/ (PageHeader, AppCard, DataTable, FormControls, AppModal, LoadingState, EmptyState, ErrorState)
        ├── pages/              # LoginPage, HomePage, ProfilePage, UsersPage, RolesPage, UnauthorizedPage, NotFoundPage
        ├── services/           # tokenStorage, apiClient, authService, usersService, rbacService, healthService
        ├── styles/tokens.css   # Centralized CSS design tokens, Light/Dark themes & Khmer typography
        ├── test/ / __tests__/  # Vitest + React Testing Library automated UI tests
        └── (planned folders: features/, hooks/, utils/)
```

## 3. Core Architectural Rules

1. **Thin Views, Dedicated Services:** Django views handle HTTP request/response, auth, and permissions; domain & security rules live in `services.py`.
2. **Authoritative Backend Security:** Django enforces active-user checks, RBAC permissions, and anti-privilege-escalation rules on every mutation; React guards are strictly UX.
3. **Single Page Source for Dual Layouts:** `VerticalLayout` and `HorizontalLayout` wrap `<Outlet />` inside `AppShell` — never duplicate pages per layout.
4. **Audit Trail Integrity:** Security and sensitive financial operations write sanitized append-only `AuditLog` records inside `transaction.atomic()`.
5. **PostgreSQL Readiness:** ORM models and queries avoid SQLite-specific hacks so production can switch cleanly to PostgreSQL.
