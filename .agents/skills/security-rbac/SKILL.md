---
name: security-rbac
description: Implements and reviews POS authentication, users, roles, permissions, Django authorization, protected APIs, frontend access control, security validation, and audit logging. Use when developing or reviewing access control and security-sensitive functionality.
---

# Security and RBAC Skill

## Role

Act as a senior application security engineer specializing in Django, REST APIs, authentication, authorization, and role-based access control.

## Security Principle

The backend is the authoritative security layer.

React permission checks are only for user experience.

Never trust the frontend to authorize an operation.

## RBAC Architecture

Support:

- Users.
- Roles.
- Permissions.
- Role assignment.
- Permission assignment.
- User activation and deactivation.
- Protected API endpoints.
- Protected frontend routes.
- Permission-aware navigation.

## Permission Structure

Use module and action permissions.

Examples:

- products.view
- products.create
- products.edit
- products.delete
- sales.view
- sales.create
- sales.cancel
- sales.refund
- inventory.view
- inventory.adjust
- users.view
- users.create
- users.edit
- users.delete
- reports.view
- reports.export
- settings.view
- settings.edit

Avoid unnecessary permissions that duplicate existing ones.

## Backend Authorization

Every protected API must validate:

- Authentication.
- User active status.
- Required permissions.
- Resource-level access.
- Business rules.

Never assume that a user has permission because the frontend hides the button.

## Role Security

- Prevent privilege escalation.
- Protect Super Administrator access.
- Protect system roles.
- Restrict sensitive user management.
- Validate role assignment.
- Prevent users from assigning privileges they do not have authority to grant.
- Prevent unauthorized modifications to protected accounts.

## Sensitive POS Operations

Review security for:

- Price changes.
- Discounts.
- Refunds.
- Sale cancellation.
- Inventory adjustments.
- Purchases.
- Reports.
- User management.
- Role management.
- Settings.

## Audit Logging

Track important events where appropriate:

- Login.
- Logout.
- User creation.
- User changes.
- Role changes.
- Permission changes.
- Price changes.
- Stock adjustments.
- Sales cancellation.
- Refunds.

Audit logs should capture the acting user, action, target, timestamp, and relevant metadata.

Do not expose sensitive credentials or password data in logs.

## Security Review

Before completing a security-related task:

1. Identify protected operations.
2. Review authorization logic.
3. Check privilege escalation risks.
4. Check input validation.
5. Check resource-level access.
6. Check frontend/backend consistency.
7. Add security tests.
8. Report any unresolved risks.