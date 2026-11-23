# POS System

A modular, production-oriented Point of Sale (POS) web application with a decoupled React + Vite + Bootstrap 5 frontend and a Django + Django REST Framework backend with JWT authentication and server-side RBAC.

## Technology Stack

- **Frontend:** React, Vite, JavaScript, Bootstrap 5, Bootstrap Icons, React Router, Axios
- **Backend:** Python, Django, Django REST Framework, `djangorestframework-simplejwt`, `django-cors-headers`, `python-dotenv`
- **Database:** SQLite for initial local development (PostgreSQL-compatible architecture)
- **Security:** JWT (access + rotated/blacklisted refresh tokens), server-side `<module>.<action>` RBAC, anti-privilege-escalation guards, append-only security audit logs

## Repository Structure

```text
pos-system/
├── AGENTS.md                 # Workspace rules and engineering standards
├── .agents/skills/           # Specialized Antigravity workspace skills
├── .env.example              # Reference environment variables
├── .gitignore                # Git ignore rules
├── backend/                  # Django + DRF REST API
│   ├── .env.example
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/               # Settings (base/dev/prod), URLs, WSGI/ASGI
│   └── apps/                 # Modular Django applications
│       ├── core/             # Infrastructure & /api/v1/health/ endpoint
│       ├── audit/            # Append-only security audit logs (/api/v1/audit-logs/)
│       ├── rbac/             # Roles, permissions, anti-escalation services, DRF permissions
│       └── accounts/         # Custom User model, JWT auth, profile, password, user admin APIs
├── frontend/                 # React + Vite SPA
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── app/              # Router configuration with ProtectedRoute guards
│       ├── components/       # ErrorBoundary, StatusAlert, ProtectedRoute
│       ├── contexts/         # AuthContext (session hydration, permissions, login/logout)
│       ├── layouts/          # MainLayout with permission-aware navigation & user menu
│       ├── pages/            # LoginPage, HomePage, ProfilePage, UsersPage, RolesPage, UnauthorizedPage, NotFoundPage
│       ├── services/         # apiClient (JWT + refresh interceptor), authService, usersService, rbacService, healthService
│       └── styles/           # Centralized CSS design tokens
└── docs/                     # Architecture, schema, API, RBAC, UI, roadmap, ADRs
```

## Prerequisites

- **Python 3** (tested with Python 3.15)
- **Node.js & npm** (tested with Node 26 / npm 11)

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
```

Create your initial Super Administrator account (using your own local credentials):

```bash
cd backend
.venv/bin/python manage.py seed_admin --username admin --email admin@example.com --password '<your-strong-password>'
```

Start the backend server:

```bash
cd backend
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Run backend automated tests:

```bash
cd backend
.venv/bin/python manage.py test apps -v 2
```

### 3. Frontend Setup (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173` (or `http://localhost:5173`) in your browser and sign in with your bootstrapped Super Administrator account.

Build and test frontend:

```bash
cd frontend
npm test
npm run build
```

## Documentation

See [`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md) and the `docs/` directory for architecture, database schema, API contracts, RBAC matrix, UI design guidelines, roadmap, ADRs, and development progress.
