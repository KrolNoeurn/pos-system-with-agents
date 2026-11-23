# POS System

A modular, production-oriented Point of Sale (POS) web application with a decoupled React + Vite + Bootstrap 5 frontend and a Django + Django REST Framework backend.

## Technology Stack

- **Frontend:** React, Vite, JavaScript, Bootstrap 5, Bootstrap Icons, React Router, Axios
- **Backend:** Python, Django, Django REST Framework, `django-cors-headers`, `python-dotenv`
- **Database:** SQLite for initial local development (PostgreSQL-compatible architecture)
- **Planned Core Capabilities:** JWT Authentication, Server-Side RBAC, English/Khmer i18n, Vertical/Horizontal layouts, Light/Dark themes

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
│       └── core/             # Infrastructure & /api/v1/health/ endpoint
├── frontend/                 # React + Vite SPA
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── app/              # Router configuration
│       ├── components/       # Shared UI primitives & ErrorBoundary
│       ├── layouts/          # Shared application layout shell
│       ├── pages/            # Route pages (HomePage, NotFoundPage)
│       ├── services/         # Centralized Axios client & API services
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

### 2. Backend Setup (Django + DRF)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Verify the health endpoint:

```bash
curl http://127.0.0.1:8000/api/v1/health/
```

Run backend automated tests:

```bash
cd backend
.venv/bin/python manage.py test
```

### 3. Frontend Setup (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173` (or `http://localhost:5173`) in your browser. The application shell automatically calls `GET /api/v1/health/` via the centralized Axios client (`VITE_API_BASE_URL`).

Build frontend for production verification:

```bash
cd frontend
npm run build
```

## Documentation

See [`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md) and the full `docs/` directory for architecture, database schema, API contracts, RBAC matrix, UI design guidelines, roadmap, ADRs, and development progress.
