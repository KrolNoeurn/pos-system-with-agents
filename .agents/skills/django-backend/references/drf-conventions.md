# DRF API & Service Conventions

Reference for implementing consistent Django REST Framework endpoints and service layers in the POS backend.

## URL & Resource Naming

- Prefix all versioned APIs with `/api/v1/`.
- Use plural, kebab-case nouns for resource collections:
  - `/api/v1/auth/login/`, `/api/v1/auth/refresh/`, `/api/v1/auth/logout/`, `/api/v1/auth/me/`
  - `/api/v1/users/`, `/api/v1/roles/`, `/api/v1/permissions/`
  - `/api/v1/products/`, `/api/v1/categories/`, `/api/v1/units/`
  - `/api/v1/inventory/movements/`, `/api/v1/inventory/adjustments/`
  - `/api/v1/sales/`, `/api/v1/sales/{id}/cancel/`, `/api/v1/sales/{id}/refund/`
  - `/api/v1/purchases/`, `/api/v1/expenses/`, `/api/v1/reports/`, `/api/v1/settings/`

## Standard HTTP Status Codes

| Code | Usage |
| :--- | :--- |
| `200 OK` | Successful read, update, or action with body |
| `201 Created` | Resource or transaction created |
| `204 No Content` | Successful delete or logout without body |
| `400 Bad Request` | Validation error or domain rule violation (e.g., insufficient stock) |
| `401 Unauthorized` | Missing, invalid, or expired JWT credentials |
| `403 Forbidden` | Authenticated user lacks required permission or resource access |
| `404 Not Found` | Resource does not exist (or hidden for unauthorized tenant/scope) |
| `409 Conflict` | Duplicate idempotency key, state transition conflict (e.g., already cancelled) |

## Pagination, Filtering & Search

- Paginate all list endpoints by default (e.g., `page`, `page_size` with a safe upper cap such as `100`).
- Support explicit `search`, filter parameters (e.g., `category`, `status`, `date_from`, `date_to`), and whitelisted `ordering` fields.

## Service Layer Pattern

- Accept validated primitive/domain arguments or typed dataclasses—not raw `request` objects—so services can be tested independently and reused from management commands or background jobs.
- Raise explicit domain exceptions (mapped cleanly to `400` or `409` responses) rather than returning opaque booleans.
- Write audit log records inside the same `transaction.atomic()` block as the state change they describe.
