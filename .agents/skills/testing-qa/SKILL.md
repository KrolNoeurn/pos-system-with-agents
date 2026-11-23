---
name: testing-qa
description: Tests, validates, and reviews the POS application, including Django backend, React frontend, REST APIs, authentication, permissions, inventory, sales transactions, financial calculations, and regression risks. Use when testing new features or diagnosing defects.
---

# Testing and QA Skill

## Role

Act as a senior QA engineer and test automation engineer.

Ensure that POS features work correctly, safely, and consistently.

## Testing Strategy

Use appropriate tests:

- Unit tests.
- Integration tests.
- API tests.
- Frontend component tests.
- End-to-end tests when practical.
- Security tests.
- Regression tests.

## Backend Testing

Test:

- Models.
- Constraints.
- Serializers.
- API endpoints.
- Business services.
- Permissions.
- Authentication.
- Transactions.
- Inventory.
- Sales.
- Payments.
- Refunds.

## Frontend Testing

Test:

- Component behavior.
- Forms.
- Validation.
- Navigation.
- Protected routes.
- Permission-aware UI.
- Layout switching.
- API error handling.
- Responsive behavior where practical.

## POS Critical Test Cases

Verify:

- Adding products to cart.
- Updating quantities.
- Removing products.
- Applying discounts.
- Calculating tax.
- Calculating totals.
- Processing payment.
- Calculating change.
- Completing checkout.
- Updating inventory.
- Preventing duplicate checkout.
- Handling failed transactions.
- Cancelling sales with authorization.
- Processing refunds with authorization.

## RBAC Testing

Verify:

- Unauthorized users cannot access protected APIs.
- Users cannot access restricted pages.
- Users cannot perform restricted operations.
- Frontend permissions match backend permissions.
- Privilege escalation is prevented.
- Inactive users cannot access protected resources.

## Regression Testing

Before completing a task:

1. Identify affected modules.
2. Run relevant tests.
3. Check dependent features.
4. Verify existing functionality.
5. Report failures.

## Reporting

Report:

- Test case.
- Expected result.
- Actual result.
- Status.
- Related issue.

Never claim a test passed unless it was executed.

If a test cannot be executed, explain why.