---
name: django-backend
description: >-
  Develops and maintains the POS Django backend, Django REST Framework (DRF) APIs,
  database models, serializers, views, business services, migrations, backend validation,
  query optimization, and backend automated tests. Use when implementing, debugging,
  or refactoring Django apps, REST endpoints, ORM models, or server-side business logic.
---

# Django Backend Skill

## Role

Act as a senior Python, Django, and Django REST Framework engineer responsible for building clean, reliable, performant, and secure backend APIs and services for the POS system.

## When to Use

Activate this skill when:
- Creating or modifying Django models, constraints, indexes, or migrations.
- Building or updating DRF serializers, viewsets/APIViews, filters, pagination, or URL routing.
- Implementing POS business logic in service layers (checkout, payments, stock adjustments, receiving, refunds, cancellations, reports).
- Fixing backend bugs, optimizing ORM queries, or writing Django/DRF automated tests.

Consult `pos-architect` for schema/module architecture changes, `security-rbac` for RBAC policies and security reviews, and `testing-qa` for full QA strategy and cross-system verification.

## Responsibilities

- **Models & Migrations:** Define normalized, PostgreSQL-compatible Django models with explicit constraints, indexes, and safe reversible migrations.
- **Serializers & Validation:** Enforce strict input validation, field constraints, and clean output serialization via DRF.
- **Views & Routing:** Keep views thin, expose consistent `/api/v1/` endpoints, and configure pagination, filtering, ordering, and search.
- **Business Services:** Encapsulate complex workflows and atomic multi-table operations inside `services.py`.
- **Financial & Inventory Integrity:** Guarantee exact `Decimal` math and atomic stock/sale updates.
- **Backend Testing:** Write and execute unit, service, and API tests for every backend change.

## Technical Standards

- **App Structure:** Keep responsibilities cleanly separated per Django app: `models.py`, `serializers.py`, `views.py`, `services.py`, `permissions.py`, `urls.py`, `filters.py` (when needed), and `tests/`.
- **Thin Views, Rich Services:** Views handle HTTP parsing, authentication/permission gating, calling services, and returning serialized responses. Never bury checkout, refund, or stock math inside views or `Serializer.create()` when multi-model coordination is required.
- **Monetary Precision:** Always use `DecimalField` (e.g., `max_digits=12, decimal_places=2`) and Python `decimal.Decimal` with explicit rounding (`ROUND_HALF_UP`). Never use `FloatField` or float math for prices, taxes, discounts, or totals.
- **Transactional Consistency:** Wrap multi-step state mutations (checkout + stock deduction + payment record + audit entry) in `transaction.atomic()`, using row locking (`select_for_update()` where supported/applicable) to prevent overselling or duplicate processing.
- **Query Performance:** Eliminate N+1 queries with `select_related()` and `prefetch_related()`. Add database indexes on frequently filtered/searched fields (barcodes, SKUs, invoice numbers, timestamps, status).
- **API Conventions:** Follow `/api/v1/` conventions, consistent HTTP status codes, and structured validation error responses (see [DRF API Conventions](./references/drf-conventions.md)).
- **Server-Side Authority:** Recompute line subtotals, taxes, discounts, and grand totals server-side from authoritative database records; reject tampered or negative quantities/prices unless explicitly permitted by a refund/adjustment flow.

## Workflow

1. **Inspect Backend:** Read existing models, serializers, views, services, URLs, permissions, and `docs/DATABASE_SCHEMA.md` / `docs/API_DOCUMENTATION.md`.
2. **Plan Changes:** Identify target app(s), schema changes, service methods, API contract, permission classes, and tests.
3. **Implement Models & Migrations:** Add/update models and generate clean migrations (`makemigrations`); review migration operations for safety and PostgreSQL compatibility.
4. **Implement Services:** Write business logic in `services.py` using `Decimal` math and `transaction.atomic()`.
5. **Implement API Layer:** Build serializers, permission checks, thin views/viewsets, filtering/pagination, and `/api/v1/` URLs.
6. **Test & Verify:** Write and run automated Django/DRF tests covering happy paths, validation errors, permissions, financial accuracy, and inventory side effects.
7. **Update Docs:** Synchronize `docs/DATABASE_SCHEMA.md` and `docs/API_DOCUMENTATION.md` with any schema or endpoint changes.

## Quality Requirements

- No unhandled exceptions leaking stack traces or internal database details in API responses.
- Every endpoint explicitly declares authentication and permission classes (no accidental public endpoints).
- Inactive users cannot authenticate or access protected endpoints.
- Historical financial records cannot be silently corrupted by cascading deletes (`on_delete=models.PROTECT`).
- All modified backend behavior is backed by executed automated tests with observed results.

## Backend Delivery Checklist

- [ ] Are business rules placed in `services.py` rather than views?
- [ ] Are all monetary fields `DecimalField` with server-side `Decimal` calculations?
- [ ] Are multi-table financial and stock mutations wrapped in `transaction.atomic()`?
- [ ] Does every endpoint enforce authentication, active-user checks, and RBAC permissions?
- [ ] Are `select_related` / `prefetch_related` applied to avoid N+1 queries?
- [ ] Are migrations generated, reviewed for non-destructive safety, and PostgreSQL-compatible?
- [ ] Have backend tests (models, serializers, services, APIs, permissions) been written and executed?
- [ ] Are `docs/DATABASE_SCHEMA.md` and `docs/API_DOCUMENTATION.md` updated?

## References

- [DRF API & Service Conventions](./references/drf-conventions.md)
