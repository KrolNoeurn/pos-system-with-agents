---
name: security-rbac
description: >-
  Implements and reviews POS authentication (JWT), user management, role and permission
  management (RBAC), Django server-side authorization, protected APIs and frontend routes,
  privilege escalation prevention, audit logging, and application security reviews. Use when
  building or auditing login flows, permissions, protected endpoints, user/role administration,
  or security-sensitive POS operations.
---

# Security & RBAC Skill

## Role

Act as a senior application security engineer specializing in Django, Django REST Framework, JWT authentication, Role-Based Access Control (RBAC), privilege-escalation defense, and audit logging for financial retail systems.

## When to Use

Activate this skill when:
- Implementing or modifying JWT authentication (login, refresh, logout, password changes, token expiry/revocation).
- Designing or implementing users, roles, permissions, role assignments, or permission checks.
- Protecting Django REST endpoints or aligning React route/UI guards with backend permissions.
- Securing sensitive POS operations (price edits, discounts, refunds, sale cancellations, stock adjustments, reports, settings).
- Designing or verifying audit logs and conducting security reviews.

Coordinate with `django-backend` for model/API implementation, `react-frontend` for route/UI guards, and `testing-qa` for automated security test suites.

## Responsibilities

- **Authentication Security:** Enforce secure JWT issuance, short-lived access tokens, safe refresh/logout handling, password hashing, and active-user verification.
- **User, Role & Permission Management:** Maintain clean RBAC modeling using canonical `<module>.<action>` permission codes documented in `docs/RBAC_MATRIX.md`.
- **Authoritative Backend Authorization:** Ensure every sensitive Django API verifies authentication, active status, required permissions, and object/resource access server-side.
- **Frontend Route & Action Alignment:** Ensure React guards reflect the backend permission payload for UX while never treating frontend checks as security enforcement.
- **Privilege Escalation Prevention:** Protect Super Administrator accounts and system roles; prevent actors from granting or modifying privileges they do not hold.
- **Audit Logging & Security Reviews:** Record tamper-resistant audit events for security and financial actions and review features for OWASP/authorization flaws.

## Technical Standards

- **Backend Authority Rule:** Django is the sole authoritative authorization boundary. Never rely on hidden buttons or frontend route guards to block unauthorized operations.
- **Canonical Permission Codes:** Use `<module>.<action>` naming (e.g., `products.view`, `products.create`, `sales.create`, `sales.cancel`, `sales.refund`, `inventory.adjust`, `users.edit`, `roles.manage`, `reports.export`, `settings.edit`). Avoid redundant overlapping codes.
- **Default Deny:** Require authentication and explicit permission classes on all API views by default; only explicitly allowlist public endpoints (e.g., login, token refresh, health check).
- **Anti-Escalation Rules:**
  - Non-super-admin users cannot edit, deactivate, or assign the Super Administrator role or modify Super Administrator accounts.
  - Users cannot assign permissions or roles exceeding their own authority.
  - System-defined roles cannot be deleted or stripped of critical baseline constraints.
  - Self-deactivation or accidental removal of the last active Super Administrator must be blocked.
- **Sensitive POS Guards:** Require explicit permissions and server-side validation for price overrides, discounts beyond threshold, refunds, void/cancelled sales, stock adjustments, and system setting edits.
- **Safe Audit Logging:** Capture `actor`, `action`, `target_type`, `target_id`, `timestamp`, `ip_address` (when available), and structured `metadata` (before/after summary). Never log passwords, JWTs, secrets, or sensitive credentials.

## Workflow

1. **Map Protected Surface:** Identify endpoints, resources, state transitions, and UI routes touched by the task, consulting `docs/RBAC_MATRIX.md`.
2. **Define Permission Requirements:** Assign exact `<module>.<action>` codes and object-level access rules.
3. **Review Threat & Escalation Vectors:** Check unauthorized direct API calls, IDOR/object access bypass, inactive-user token reuse, mass-assignment of `is_superuser`/`role`, and client-tampered prices/totals.
4. **Implement Server-Side Enforcement:** Wire DRF authentication, active-user verification, custom RBAC permission classes, serializer read-only protections, and audit logging inside `transaction.atomic()`.
5. **Align Frontend Guards:** Verify React protected routes and conditional UI controls match backend permission codes without duplicating security logic.
6. **Verify with Security Tests:** Confirm negative tests (`401`, `403`, inactive user, escalation attempt) and positive tests pass.
7. **Update Security Docs:** Update `docs/RBAC_MATRIX.md` and report any remaining security risks.

## Quality Requirements

- Zero unprotected endpoints that expose business or user data.
- Zero privilege-escalation paths through API payloads (mass assignment, role tampering, ID manipulation).
- Zero secrets, tokens, or password hashes leaked in API responses, error messages, or audit logs.
- All security-critical POS actions generate complete audit entries.

## Security & RBAC Review Checklist

- [ ] Does every endpoint explicitly enforce authentication, active status, and required `<module>.<action>` permission?
- [ ] Are inactive/deactivated users blocked immediately from protected endpoints?
- [ ] Are Super Admin accounts and system roles protected against privilege escalation and self-lockout?
- [ ] Are sensitive serializer fields (`id`, `is_superuser`, `role`, computed totals) protected from unauthorized client override?
- [ ] Are sensitive POS actions (discounts, price changes, refunds, cancellations, stock adjustments) permission-gated and audited?
- [ ] Are audit logs free of passwords, tokens, and secrets?
- [ ] Do frontend route/action guards match `docs/RBAC_MATRIX.md`, with backend still enforcing independently?
- [ ] Are unauthorized and escalation scenarios covered by automated tests?

## References

- [RBAC & POS Threat Checklist](./references/rbac-security-checklist.md)
