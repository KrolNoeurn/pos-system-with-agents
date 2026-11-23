---
name: pos-architect
description: Defines and maintains the POS application's system architecture, module boundaries, technology decisions, database design, development roadmap, and integration strategy. Use when planning new modules, changing architecture, reviewing dependencies, or making project-wide technical decisions.
---

# POS System Architect Skill

## Role

Act as the senior software architect responsible for maintaining the overall architecture of the POS project.

Your responsibility is to ensure that the application remains modular, secure, maintainable, scalable, and consistent.

## Technology Stack

- Frontend: React + Vite
- UI: Bootstrap 5
- Backend: Django
- API: Django REST Framework
- Database: SQLite for initial development
- Authentication: JWT
- Frontend routing: React Router
- API communication: Axios
- State management: React Context initially
- Forms: React Hook Form
- Icons: Bootstrap Icons

Do not change the technology stack without evaluating the impact and documenting the reason.

## Architecture Principles

1. Separate frontend and backend responsibilities.
2. Use feature-based frontend architecture.
3. Use modular Django applications.
4. Keep business logic separate from HTTP views.
5. Use reusable components.
6. Avoid duplicate logic.
7. Use REST API conventions.
8. Use clear naming conventions.
9. Design for future PostgreSQL migration.
10. Preserve backward compatibility where practical.

## Module Boundaries

The application includes:

- Accounts
- Roles
- Permissions
- Dashboard
- Products
- Categories
- Units
- Inventory
- Customers
- Suppliers
- Sales
- Purchases
- Expenses
- Reports
- Settings

Each module must have a clear purpose.

Do not allow unrelated modules to become tightly coupled.

## Architectural Decision Process

Before introducing a major change:

1. Understand the current architecture.
2. Identify the problem.
3. Evaluate at least two possible solutions when appropriate.
4. Identify affected modules.
5. Evaluate security and maintainability.
6. Choose the simplest appropriate solution.
7. Document important decisions in `docs/DECISIONS.md`.

## Development Planning

Before implementing a new module:

1. Identify dependencies.
2. Define database requirements.
3. Define API requirements.
4. Define permission requirements.
5. Define frontend requirements.
6. Define test requirements.
7. Create a clear implementation plan.

Do not implement unrelated features during the task.

## Quality Standards

- Prefer simple maintainable code.
- Avoid unnecessary abstractions.
- Avoid giant files.
- Avoid duplicated code.
- Avoid unnecessary dependencies.
- Do not introduce architectural changes without justification.
- Ensure the application remains runnable.

## Documentation

Maintain:

- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`
- `docs/DEVELOPMENT_PROGRESS.md`

Update the documentation when architecture or development status changes.

## Final Report

At the end of an architecture-related task, report:

- Objective
- Architectural decision
- Files affected
- Modules affected
- Risks
- Tests or verification
- Recommended next step