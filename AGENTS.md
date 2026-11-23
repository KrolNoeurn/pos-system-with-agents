# POS System — Workspace Instructions

## Project Objective

Build a professional, production-oriented Point of Sale (POS) web application with reliable checkout workflows, inventory control, financial accuracy, role-based access control, bilingual English/Khmer support, and dual vertical/horizontal layouts.

## Technology Stack

- **Frontend:** React, Vite, Bootstrap 5, Bootstrap Icons, React Router, Axios, React Context API, React Hook Form
- **Backend:** Python, Django, Django REST Framework (DRF)
- **Database:** SQLite for initial development with PostgreSQL-compatible schema and ORM patterns
- **Authentication:** JWT (access and refresh tokens)
- **Authorization:** Role-Based Access Control (RBAC) enforced server-side in Django
- **Internationalization:** English (`en`) and Khmer (`km`)
- **UI Layouts & Themes:** Vertical and Horizontal navigation layouts; Light and Dark themes

## Architecture Principles

- Keep `frontend/` and `backend/` strictly decoupled via versioned REST APIs (`/api/v1/`).
- Organize the frontend by feature modules with shared layouts, reusable UI components, and centralized API services.
- Organize the backend into modular Django apps with clean boundaries and minimal cross-app coupling.
- Keep business logic in dedicated service modules (`services.py`), never bloated inside views or serializers.
- Reuse components, hooks, permissions, and services; avoid duplicated logic and premature abstractions.
- Design database models and queries to migrate cleanly from SQLite to PostgreSQL.

## Security Requirements

- Django is the single authoritative authorization layer; never rely on React checks for security.
- Require authentication and explicit permission checks on every protected API endpoint.
- Validate and sanitize all client input server-side; never trust client-calculated totals, prices, or roles.
- Enforce user active status and prevent privilege escalation across user, role, and permission management.
- Never commit or expose secrets, tokens, private keys, or sensitive credentials in code, logs, or responses.
- Record audit logs for security-sensitive and financial operations (auth events, RBAC changes, price edits, stock adjustments, refunds, cancellations).

## Backend Conventions

- Structure Django apps cleanly: `models.py`, `serializers.py`, `views.py`, `services.py`, `permissions.py`, `urls.py`, `tests/`.
- Use `DecimalField` for all monetary values; never use floating-point arithmetic for financial calculations.
- Wrap multi-step financial and inventory operations (checkout, stock adjustment, refund, cancellation) in `transaction.atomic()`.
- Prevent N+1 queries with `select_related` and `prefetch_related`.
- Preserve historical transaction integrity (snapshot unit prices/taxes on line items; avoid destructive schema changes without review).

## Frontend Conventions

- Use functional components, custom hooks, and feature-based directories; keep `App.jsx` minimal.
- Route all HTTP requests through a centralized Axios client configured via environment variables with token and error handling.
- Share page components across both Vertical and Horizontal layouts—never duplicate pages per layout.
- Handle loading, empty, validation, permission-denied, and server-error states on every view and form.
- Prevent accidental double submissions on checkout and mutation forms.

## UI/UX Rules

- Prioritize cashier speed, keyboard/touchscreen ergonomics, and clear visual hierarchy on POS checkout screens.
- Use centralized CSS variables / Bootstrap 5 theme tokens for Light and Dark themes; avoid hardcoded colors.
- Ensure proper Khmer typography, line-height, and text-wrapping so translations never break layouts or buttons.
- Maintain responsive Bootstrap 5 grids across desktop, laptop, tablet, and mobile viewports.
- Meet baseline accessibility standards: contrast, focus rings, semantic labels, and keyboard navigation.

## Testing Requirements

- Write automated tests for models, serializers, APIs, permissions, business services, financial math, inventory changes, and critical frontend flows.
- Test both positive paths and unauthorized/edge-case scenarios (inactive users, missing permissions, privilege escalation, failed transactions).
- Execute relevant tests after changes and verify regression safety on affected modules.

## Documentation Requirements

- Maintain project documentation in `docs/` (`PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `RBAC_MATRIX.md`, `UI_DESIGN_GUIDELINES.md`, `ROADMAP.md`, `DEVELOPMENT_PROGRESS.md`, `DECISIONS.md`).
- Update affected docs whenever schemas, endpoints, permissions, architecture, or milestones change.

## Development Workflow

1. Inspect existing code and documentation before editing.
2. Plan changes clearly before major or cross-cutting work.
3. Implement one focused feature or fix at a time; avoid unrelated edits.
4. Test thoroughly and review for quality, security, and maintainability.
5. Update relevant documentation and keep the application runnable.

## Integrity & Anti-Fake Rules

- **No fake functionality:** Never ship placeholder buttons, mocked success responses, dead controls, or decorative UI that claims to work when it does not. If a capability is out of scope, omit it or mark it explicitly as planned/disabled with user agreement.
- **No unverified claims:** Never claim a task, build, migration, or test passed unless you actually executed and observed it. If a check cannot be run, state clearly why.

## Workspace Skills

Consult the specialized skills in `.agents/skills/` whenever working in their domain:

- `pos-architect` — System architecture, module boundaries, database & API design, tech decisions, roadmap.
- `django-backend` — Django models, DRF APIs, serializers, services, migrations, backend validation & tests.
- `react-frontend` — React/Vite components, routing, Axios integration, Context state, forms, responsive pages.
- `ui-ux-design` — POS UX, design system, themes, Vertical/Horizontal layouts, Khmer typography, accessibility.
- `security-rbac` — JWT auth, RBAC users/roles/permissions, API/route protection, anti-escalation, audit logging.
- `testing-qa` — Test strategy, backend/frontend/API/security/financial/POS transaction testing, QA reports.
- `project-workflow` — End-to-end task coordination: inspect, analyze, plan, implement, test, review, document, report.

## Reporting

Conclude substantive tasks with actual changes made, commands/tests executed and their observed results, remaining issues or risks, and recommended next steps.
