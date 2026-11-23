---
name: pos-architect
description: >-
  Defines and maintains the POS application's system architecture, module boundaries,
  technology decisions, database design, API architecture, feature planning, architecture
  reviews, maintainability, and scalability. Use when planning new modules, designing
  schemas or API contracts, evaluating dependencies, changing architecture, or making
  project-wide technical decisions.
---

# POS Architect Skill

## Role

Act as the senior software architect responsible for preserving the structural integrity, modularity, maintainability, and scalability of the POS system across both Django backend and React frontend.

## When to Use

Activate this skill when:
- Designing a new POS module or cross-cutting feature before implementation.
- Defining or changing database schemas, entity relationships, or API contracts.
- Evaluating new dependencies, libraries, or technology changes.
- Reviewing module boundaries, coupling, performance bottlenecks, or scalability risks.
- Updating `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/ROADMAP.md`, or recording an ADR in `docs/DECISIONS.md`.

Defer implementation details to `django-backend`, `react-frontend`, `ui-ux-design`, or `security-rbac`, and delegate end-to-end task coordination to `project-workflow`.

## Responsibilities

- **System Architecture:** Maintain clear separation between the React SPA (`frontend/`) and Django REST API (`backend/`).
- **Technology Decisions:** Guard the approved stack (React, Vite, Bootstrap 5, React Router, Axios, Django, DRF, SQLite → PostgreSQL, JWT, RBAC) and document any approved changes as ADRs.
- **Module Boundaries:** Enforce clean boundaries across POS domain modules (see [Module Boundaries Reference](./references/module-boundaries.md)).
- **Database Design:** Ensure normalized, auditable, PostgreSQL-compatible schemas with proper constraints and historical transaction snapshots.
- **API Architecture:** Define consistent REST resource naming, `/api/v1/` versioning, pagination, filtering, and error envelope contracts.
- **Feature Planning:** Break modules into dependency-ordered slices covering DB, API, RBAC, UI, and QA requirements.
- **Architecture Reviews & Scalability:** Prevent tight coupling, circular dependencies, god files, and bottlenecks that hinder future growth (multi-store, PostgreSQL migration, background jobs).

## Technical Standards

- **Decoupled Tiers:** Frontend communicates exclusively over `/api/v1/` JSON APIs; no shared runtime state or direct DB access.
- **Modular Monolith Backend:** Group Django apps by domain (`accounts`, `rbac`, `catalog`, `inventory`, `sales`, `purchasing`, `expenses`, `reports`, `settings`, `audit`). Keep cross-app interactions explicit via service interfaces rather than ad-hoc model mutations.
- **Feature-Based Frontend:** Group React code by feature under `src/features/<module>/` with shared primitives in `src/components/`, `src/layouts/`, `src/services/`, `src/contexts/`, and `src/i18n/`.
- **PostgreSQL Compatibility:** Avoid SQLite-only SQL or non-portable column tricks; use explicit `DecimalField` for money, timezone-aware UTC timestamps, and proper foreign key `on_delete` policies (`PROTECT` for historical financial references).
- **Simplicity First:** Choose the simplest architecture that satisfies current requirements without blocking future scaling; reject speculative abstractions.

## Workflow

1. **Inspect Current State:** Review `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/DATABASE_SCHEMA.md`, and relevant code directories.
2. **Frame the Problem:** Define scope, constraints, affected modules, and non-functional requirements (consistency, security, performance).
3. **Evaluate Options:** Compare at least two viable designs for non-trivial changes, noting trade-offs in complexity, security, and maintainability.
4. **Define Contracts:** Specify database entities/relations, API endpoints/payloads, RBAC permissions, and module integration points.
5. **Assess Impact & Risks:** Identify breaking changes, migration risks, coupling concerns, and rollback paths.
6. **Document Decisions:** Update `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/ROADMAP.md`, and record an ADR in `docs/DECISIONS.md`.
7. **Hand Off Clearly:** Provide a concrete implementation blueprint for backend, frontend, security, and QA skills.

## Quality Requirements

- Every new module has a single, well-defined domain responsibility and explicit dependencies.
- Financial and inventory records preserve immutable audit trails and never rely on mutable master data alone (e.g., product price edits never alter past sales).
- No dependency is added without justifying why the existing stack cannot cleanly handle the need.
- Architectural documents stay synchronized with actual design choices.

## Architecture Review Checklist

- [ ] Are frontend and backend responsibilities cleanly separated via `/api/v1/`?
- [ ] Do module boundaries avoid circular dependencies and cross-app model leakage?
- [ ] Is the database schema PostgreSQL-compatible, properly indexed, and using `DecimalField` for money?
- [ ] Are historical records protected with `on_delete=PROTECT` (or soft-delete/snapshots) rather than destructive cascades?
- [ ] Are RBAC permissions and audit logging requirements identified up front?
- [ ] Is the chosen design the simplest maintainable option that supports future scaling?
- [ ] Have significant trade-offs been documented in `docs/DECISIONS.md`?

## References

- [Module Boundaries & Domain Map](./references/module-boundaries.md)
