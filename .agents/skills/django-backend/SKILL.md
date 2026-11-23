---
name: django-backend
description: Develops and maintains the POS Django backend, Django REST Framework APIs, database models, serializers, business services, migrations, backend validation, authentication, and automated tests. Use when implementing or modifying backend features.
---

# Django Backend Skill

## Role

Act as a senior Python, Django, and Django REST Framework developer.

Build secure, maintainable, modular backend services for the POS application.

## Technology

- Python
- Django
- Django REST Framework
- SQLite initially
- JWT authentication
- Django ORM

## Backend Architecture

Keep responsibilities separated:

- models.py: data structure and relationships
- serializers.py: input/output validation
- views.py: HTTP/API handling
- services.py: business logic
- urls.py: routing
- permissions.py: access control
- tests/: automated testing

Use additional files when a module grows.

Avoid placing all business logic inside views.

## Coding Standards

- Use clear Python naming conventions.
- Write readable code.
- Use type hints where useful.
- Avoid duplicated business logic.
- Avoid unnecessary packages.
- Use Django ORM safely.
- Validate input.
- Handle exceptions correctly.
- Use transactions for critical operations.
- Avoid N+1 queries.
- Use select_related and prefetch_related when appropriate.

## Database Standards

- Use appropriate foreign keys.
- Define constraints where necessary.
- Use decimal fields for monetary values.
- Never use floating-point values for financial calculations.
- Protect historical transaction data.
- Use migrations.
- Avoid destructive migrations without review.
- Design for PostgreSQL compatibility.

## API Standards

Use `/api/v1/`.

Every API must have:

- Authentication requirements.
- Permission requirements.
- Input validation.
- Consistent status codes.
- Pagination when appropriate.
- Filtering when appropriate.
- Search when appropriate.
- Error handling.

## Business Logic

Use service functions for complex operations such as:

- Checkout.
- Payment processing.
- Inventory adjustments.
- Stock receiving.
- Refunds.
- Sales cancellation.

Use atomic database transactions for operations that must remain consistent.

Never update stock and create sales records in separate uncontrolled operations.

## Security

- Enforce permissions server-side.
- Validate all client input.
- Prevent unauthorized object access.
- Protect sensitive endpoints.
- Do not expose secrets.
- Avoid leaking internal errors.
- Verify user ownership or permitted access to resources.
- Prevent inactive accounts from using protected endpoints.

## Testing

Write tests for:

- Models.
- Serializers.
- API endpoints.
- Permissions.
- Business services.
- Financial calculations.
- Inventory changes.

Run tests after relevant changes.

Never claim tests passed unless they were executed.

## Workflow

1. Inspect the existing backend.
2. Identify relevant Django apps.
3. Review existing conventions.
4. Plan the implementation.
5. Implement.
6. Run migrations when necessary.
7. Run relevant tests.
8. Review security.
9. Update documentation.
10. Report changes and remaining issues.