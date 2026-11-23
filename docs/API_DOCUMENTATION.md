# API Documentation

> **Status:** Initial Contract Blueprint (No Endpoints Implemented Yet)

## 1. Base Conventions

- **Base URL Prefix:** `/api/v1/`
- **Content Type:** `application/json`
- **Authentication:** `Authorization: Bearer <access_token>` (JWT)
- **Authorization:** Server-side RBAC enforced on every protected endpoint via canonical `<module>.<action>` permissions (see [RBAC_MATRIX.md](./RBAC_MATRIX.md)).

## 2. Standard Response Formats

### Paginated List Response
```json
{
  "count": 42,
  "next": "/api/v1/products/?page=2",
  "previous": null,
  "results": []
}
```

### Error Response Envelope
```json
{
  "detail": "Human-readable error summary.",
  "code": "error_code",
  "errors": {
    "field_name": ["Validation message."]
  }
}
```

### Standard HTTP Status Codes
- `200 OK` / `201 Created` / `204 No Content` — Success
- `400 Bad Request` — Validation failure or domain rule violation (e.g., insufficient stock)
- `401 Unauthorized` — Missing, expired, or invalid JWT
- `403 Forbidden` — Authenticated user lacks required permission or resource access
- `404 Not Found` — Resource not found
- `409 Conflict` — State conflict or duplicate checkout idempotency key

## 3. Planned Endpoint Groups

### Authentication (`/api/v1/auth/`)
| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login/` | Public | Authenticate credentials, issue access & refresh JWTs |
| `POST` | `/api/v1/auth/refresh/` | Refresh Token | Issue fresh access token |
| `POST` | `/api/v1/auth/logout/` | Authenticated | Revoke/blacklist refresh token and log audit event |
| `GET` | `/api/v1/auth/me/` | Authenticated | Return current user profile, roles, permissions, and UI preferences |

### Users & RBAC (`/api/v1/users/`, `/api/v1/roles/`, `/api/v1/permissions/`)
| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` / `POST` | `/api/v1/users/` | `users.view` / `users.create` | List or create users |
| `GET` / `PATCH` | `/api/v1/users/{id}/` | `users.view` / `users.edit` | View or update user profile / active status / roles |
| `GET` / `POST` | `/api/v1/roles/` | `roles.view` / `roles.manage` | List or create roles |
| `PATCH` / `DELETE` | `/api/v1/roles/{id}/` | `roles.manage` | Update or delete non-system roles |
| `GET` | `/api/v1/permissions/` | `roles.view` | List available system permissions |

### Catalog & Inventory (`/api/v1/categories/`, `/api/v1/units/`, `/api/v1/products/`, `/api/v1/inventory/`)
- CRUD endpoints for categories, units, and products with barcode/SKU search and category filtering.
- `GET /api/v1/inventory/stock/` — Current stock balances and low-stock indicators.
- `GET /api/v1/inventory/movements/` — Stock ledger history.
- `POST /api/v1/inventory/adjustments/` — Controlled stock adjustment (`inventory.adjust`).

### POS Sales (`/api/v1/sales/`)
- `GET /api/v1/sales/` & `GET /api/v1/sales/{id}/` — Sales history and receipt detail (`sales.view`).
- `POST /api/v1/sales/` — Atomic POS checkout with optional `Idempotency-Key` (`sales.create`).
- `POST /api/v1/sales/{id}/cancel/` — Authorized sale void/cancellation with stock restoration (`sales.cancel`).
- `POST /api/v1/sales/{id}/refund/` — Authorized full or partial refund (`sales.refund`).

### Customers, Suppliers, Purchasing, Expenses, Reports, Settings & Audit
- `/api/v1/customers/`, `/api/v1/suppliers/`, `/api/v1/purchases/`, `/api/v1/expenses/`
- `/api/v1/reports/sales-summary/`, `/api/v1/reports/inventory/`, `/api/v1/reports/profit-loss/`
- `/api/v1/settings/` (`settings.view`, `settings.edit`)
- `/api/v1/audit-logs/` (read-only, `audit.view`)

> Update this document with exact request/response schemas as each backend module is implemented.
