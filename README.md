# POS System

A modular, production-oriented Point of Sale (POS) web application with a decoupled React + Vite + Bootstrap 5 frontend and a Django + Django REST Framework backend featuring JWT authentication, authoritative server-side RBAC, exact `Decimal` financial accounting, bilingual English/Khmer support, and Vertical/Horizontal layouts with Light/Dark themes.

## Technology Stack

- **Frontend:** React, Vite, JavaScript, Bootstrap 5, Bootstrap Icons, React Router, Axios
- **Backend:** Python, Django, Django REST Framework, `djangorestframework-simplejwt`, `django-cors-headers`, Pillow, `python-dotenv`
- **Database:** SQLite for local development; PostgreSQL-ready via `config.settings.prod` (`DB_ENGINE=postgresql`)
- **Security:** JWT (access + rotated/blacklisted refresh tokens), server-side `<module>.<action>` RBAC (39 permissions, 5 system roles), anti-privilege-escalation guards, append-only sanitized security/financial audit logs

## Implemented Modules

- **Auth & RBAC (`apps/accounts`, `apps/rbac`, `apps/audit`):** JWT login/refresh/logout, user lifecycle, custom roles, granular permissions, anti-escalation guards, append-only Audit Log explorer (`/audit-logs`)
- **Catalog (`apps/catalog`):** Hierarchical Categories (`/categories`), extensible Units (`/units`), Products with SKU/barcode/images/pricing (`/products`)
- **Inventory (`apps/inventory`):** Append-only `StockMovement` ledger, row-locked atomic balances, weighted moving-average valuation, negative-stock prevention, low-stock alerts (`/inventory`)
- **Purchasing (`apps/purchasing`):** Suppliers directory, Draft/Ordered Purchase Orders, atomic Goods Receiving updating inventory via `inventory.services` (`/purchasing`)
- **POS Checkout & Sales (`apps/sales`):** Cashier-optimized POS Checkout (`/pos`) with barcode scan, cart, Customers, Cash/Card/QR/Split payments, idempotency protection, printable bilingual receipts, Sales History, and authorized Void/Refund stock restoration (`/sales`)
- **Expenses & Cash Flow (`apps/expenses`):** Expense Categories, audited operating Expenses, and exact `Decimal` Cash Flow Summary (`/expenses`)
- **Store Settings (`apps/store_settings`):** Singleton Store Profile, USD/KHR exchange rate, default tax, receipt branding with Live Receipt Preview (`/settings`)
- **Dashboard & Reports (`apps/reports`):** Live KPI Dashboard (`/`), Profit & Loss (using COGS snapshots), Sales, Inventory Valuation, Purchasing reports, and audited CSV Export (`/reports`)

## Repository Structure

```text
pos-system/
├── AGENTS.md                   # Workspace rules and engineering standards
├── .agents/skills/             # Specialized Antigravity workspace skills
├── .env.example / .gitignore   # Environment reference & ignore rules
├── backend/                    # Django + DRF REST API
│   ├── .env.example / manage.py / requirements.txt
│   ├── config/                 # Settings (base/dev/prod), URLs, WSGI/ASGI
│   └── apps/                   # core, audit, rbac, accounts, catalog, inventory, purchasing, sales, expenses, store_settings, reports
├── frontend/                   # React + Vite SPA
│   ├── .env.example / index.html / package.json / vite.config.js
│   └── src/                    # app/, components/, contexts/, config/, i18n/, layouts/, pages/, services/, styles/, utils/, __tests__/
└── docs/                       # Architecture, schema, API, RBAC, UI, roadmap, ADRs, progress
```

## Local Development Setup

### 1. Environment Configuration

Copy the example files (never commit `.env` files with real secrets):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2. Backend Setup (Django + DRF + RBAC)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_rbac
.venv/bin/python manage.py seed_admin --username admin --email admin@example.com --password '<your-strong-password>'
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Run backend automated tests:

```bash
cd backend
.venv/bin/python manage.py check
.venv/bin/python manage.py test apps -v 2
```

### 3. Frontend Setup (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173` and sign in with your Super Administrator account.

Run frontend tests and production build:

```bash
cd frontend
npm test
npm run build
```

## Production Deployment Checklist

1. Set `DJANGO_SETTINGS_MODULE=config.settings.prod`, a strong random `DJANGO_SECRET_KEY` (>= 50 chars), explicit `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `DJANGO_CSRF_TRUSTED_ORIGINS`.
2. Configure PostgreSQL (`DB_ENGINE=postgresql`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_SSLMODE=require`) and install `psycopg[binary]` alongside `requirements.txt`.
3. Run `manage.py check --deploy`, `manage.py migrate`, `manage.py seed_rbac`, and `manage.py collectstatic --noinput`.
4. Serve Django behind a WSGI/ASGI server (e.g., Gunicorn/Uvicorn) and TLS reverse proxy (Nginx/Caddy), and serve `frontend/dist/` over HTTPS with `VITE_API_BASE_URL` pointing to `/api/v1`.

## Documentation

See [`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md), [`docs/API_DOCUMENTATION.md`](./docs/API_DOCUMENTATION.md), [`docs/RBAC_MATRIX.md`](./docs/RBAC_MATRIX.md), [`docs/ROADMAP.md`](./docs/ROADMAP.md), and [`docs/DEVELOPMENT_PROGRESS.md`](./docs/DEVELOPMENT_PROGRESS.md).
