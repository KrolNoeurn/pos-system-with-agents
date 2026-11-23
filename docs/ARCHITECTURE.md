# System Architecture

> **Status:** Phase 2 Initialized — Backend & Frontend Foundations Active; Business Modules Pending

## 1. High-Level Architecture

The POS System uses a decoupled two-tier web architecture:

```text
+-----------------------------------+        HTTPS / JSON (/api/v1/)        +------------------------------------+
|        React + Vite SPA           | <-----------------------------------> |     Django + DRF REST Backend      |
|  Bootstrap 5 | Router | Axios     |       CORS + JWT (Planned)            |  Modular Apps | Services | DRF     |
+-----------------------------------+                                       +------------------------------------+
                                                                                              |
                                                                                              v
                                                                            +------------------------------------+
                                                                            |  SQLite (Dev) / PostgreSQL (Prod)  |
                                                                            +------------------------------------+
```

- **Frontend (`frontend/`):** Single-page application built with React, Vite, Bootstrap 5, Bootstrap Icons, React Router, and Axios. Communicates with the backend exclusively through `src/services/apiClient.js` configured via `VITE_API_BASE_URL`.
- **Backend (`backend/`):** Django + DRF REST API serving versioned `/api/v1/` endpoints with split settings (`base.py`, `dev.py`, `prod.py`), secure-by-default DRF permissions (`IsAuthenticated`), CORS enforcement (`django-cors-headers`), and modular domain apps under `backend/apps/`.

## 2. Current & Planned Repository Structure

```text
pos-system/
├── AGENTS.md                   # Primary workspace instructions
├── README.md                   # Developer setup and run guide
├── .env.example                # Root environment variable reference
├── .gitignore                  # Repository ignore rules
├── .agents/skills/             # Workspace Agent Skills
├── docs/                       # Architecture, schema, API, RBAC, UI, roadmap, ADRs
├── backend/                    # Django + DRF project (initialized)
│   ├── .env.example            # Backend environment template
│   ├── manage.py               # Django CLI entrypoint (loads backend/.env)
│   ├── requirements.txt        # Pinned Python dependencies
│   ├── config/
│   │   ├── urls.py             # Routes /admin/ and /api/v1/
│   │   ├── asgi.py / wsgi.py   # ASGI & WSGI entrypoints
│   │   └── settings/
│   │       ├── base.py         # Shared settings (DRF, CORS, SQLite, env helpers)
│   │       ├── dev.py          # Local development settings
│   │       └── prod.py         # Production security settings foundation
│   └── apps/
│       ├── core/               # [Initialized] Health service, /api/v1/health/, tests
│       └── (planned domain apps: accounts, rbac, audit, catalog, inventory,
│            customers, suppliers, sales, purchasing, expenses, reports, settings)
└── frontend/                   # React + Vite project (initialized)
    ├── .env.example            # Frontend environment template
    ├── index.html              # HTML shell (data-bs-theme="light")
    ├── package.json            # Dependencies & Vite scripts
    ├── vite.config.js          # Vite dev server (127.0.0.1:5173)
    └── src/
        ├── main.jsx            # Entrypoint loading Bootstrap 5, Icons, tokens.css
        ├── App.jsx             # Minimal root: ErrorBoundary + RouterProvider
        ├── app/router.jsx      # React Router layout & route table
        ├── components/         # ErrorBoundary, StatusAlert (shared UI primitives)
        ├── layouts/            # MainLayout shell (future Vertical/Horizontal shells)
        ├── pages/              # HomePage (health status shell), NotFoundPage
        ├── services/           # apiClient.js (Axios + error normalizer), healthService.js
        ├── styles/tokens.css   # Centralized CSS design tokens & Khmer line-height rules
        └── (planned folders: contexts/, features/, hooks/, i18n/, utils/)
```

## 3. Core Architectural Rules

1. **Thin Views, Dedicated Services:** Django views handle HTTP request/response, auth, and permissions; domain logic lives in `services.py` (demonstrated in `apps/core/services.py`).
2. **Secure by Default:** DRF sets `IsAuthenticated` globally; only explicitly public endpoints such as `/api/v1/health/` override with `AllowAny`.
3. **Atomic Financial & Stock Transactions:** Future checkout, cancellation, refund, and stock adjustments will execute inside `transaction.atomic()`.
4. **Immutable Sales History:** Sale line items will snapshot product name, SKU, unit price, cost, discount, and tax rate at transaction time.
5. **Single Page Source for Dual Layouts:** Vertical and Horizontal layouts will wrap shared React Router `<Outlet />` pages—never duplicate pages per layout.
6. **PostgreSQL Readiness:** ORM models and queries avoid SQLite-specific hacks so production can switch cleanly to PostgreSQL.

## 4. Cross-Module Dependency Boundaries

- `core` and future `audit` serve as foundational infrastructure modules with no upward domain dependencies.
- `rbac` will depend only on `audit`.
- `sales` and `purchasing` will mutate stock exclusively through `inventory` service functions.
- `reports` will perform read-only queries and never mutate transactional tables.
