# RBAC & POS Threat Checklist

Quick reference for reviewing high-risk POS endpoints and privilege boundaries.

## High-Risk Attack Vectors to Verify

1. **Direct API Bypass:** Calling `POST /api/v1/sales/{id}/refund/` or `PATCH /api/v1/products/{id}/` directly with a Cashier JWT when the UI hides those controls must return `403 Forbidden`.
2. **Mass Assignment / Role Escalation:** Passing `is_superuser: true`, `is_staff: true`, or an elevated `role_id` in user profile update or registration endpoints must be rejected or ignored via explicit serializer allowlists.
3. **Price & Total Tampering:** Submitting altered `unit_price`, `subtotal`, `tax_amount`, or negative `quantity` in checkout payloads must be ignored or rejected; the backend must compute totals from catalog prices and permitted discount rules.
4. **Inactive User Reuse:** A deactivated user holding a previously issued JWT must be denied (`401`/`403`) on subsequent API calls and token refreshes.
5. **Audit Tampering:** Audit log endpoints must be read-only (no `PUT`, `PATCH`, or `DELETE` endpoints exposed).

## Mandatory Audited Events

- Authentication: login success/failure, logout, password reset/change.
- User & RBAC: user created/updated/deactivated, role created/updated/deleted, role-permission or user-role assignment changed.
- Catalog & Pricing: product price or cost modified.
- Inventory: manual stock adjustment, stock write-off/damage.
- Sales & Finance: sale void/cancellation, refund issued, manual discount override.
- Settings: tax rate, currency, or store configuration modified.
