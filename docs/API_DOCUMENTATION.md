# API Documentation

> **Status:** Phase 3 Active — Health, JWT Authentication, Users, Roles, Permissions & Audit Logs Implemented

## 1. Base Conventions

- **Base URL Prefix:** `/api/v1/`
- **Content Type:** `application/json`
- **Authentication:** `Authorization: Bearer <access_token>` (JWT via `djangorestframework-simplejwt` with refresh rotation & blacklist)
- **Authorization:** Default-deny (`IsActiveAuthenticated`) plus explicit `<module>.<action>` RBAC permissions enforced server-side in Django (see [RBAC_MATRIX.md](./RBAC_MATRIX.md)).

## 2. Standard HTTP Status Codes

- `200 OK` / `201 Created` / `204 No Content` — Success
- `400 Bad Request` — Validation failure or domain rule violation (e.g., self-deactivation, weak password)
- `401 Unauthorized` — Missing, expired, revoked, or invalid JWT, or deactivated user
- `403 Forbidden` — Authenticated active user lacks required permission or attempted privilege escalation
- `404 Not Found` — Resource not found

## 3. Implemented Endpoints

### Core Infrastructure (`/api/v1/health/`)
| Method | Endpoint | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health/` | Public (`AllowAny`) | Backend & SQLite connectivity health check (`200` / `503`) |

### Authentication & Profile (`/api/v1/auth/`)
| Method | Endpoint | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login/` | Public (`AllowAny`) | Authenticate username/email + password; returns `{ access, refresh, user }` |
| `POST` | `/api/v1/auth/refresh/` | Public (`AllowAny`) | Rotate refresh token and issue new `{ access, refresh }` (rejects inactive users) |
| `POST` | `/api/v1/auth/logout/` | Authenticated (Active) | Blacklist refresh token and log `auth.logout` (`204`) |
| `GET` | `/api/v1/auth/me/` | Authenticated (Active) | Return current user profile, roles, sorted permissions, and UI preferences |
| `PATCH` | `/api/v1/auth/me/` | Authenticated (Active) | Update own `full_name`, `phone`, `preferred_language`, `preferred_theme`, `preferred_layout` |
| `POST` | `/api/v1/auth/change-password/` | Authenticated (Active) | Validate `current_password`, apply Django validators, update password |

### User Management (`/api/v1/users/`)
| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/` | `users.view` | Paginated user list (`?search=`, `?is_active=true\|false`, `?role=<id>`) |
| `POST` | `/api/v1/users/` | `users.create` | Create user account with optional `role_ids` (anti-escalation enforced) |
| `GET` | `/api/v1/users/{id}/` | `users.view` | Retrieve user detail |
| `PATCH` | `/api/v1/users/{id}/` | `users.edit` | Update user profile, optional password reset, or `role_ids` |
| `DELETE` | `/api/v1/users/{id}/` | `users.delete` | Delete non-system, non-self, non-last-super-admin user |
| `POST` | `/api/v1/users/{id}/activate/` | `users.deactivate` or `users.edit` | Activate user account |
| `POST` | `/api/v1/users/{id}/deactivate/` | `users.deactivate` or `users.edit` | Deactivate user account (immediately invalidates API & refresh access) |
| `PUT` | `/api/v1/users/{id}/roles/` | `users.edit` | Assign roles (`{ "role_ids": [...] }`) with anti-escalation checks |

### Roles & Permissions (`/api/v1/roles/`, `/api/v1/permissions/`)
| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/permissions/` | `roles.view` or `roles.manage` | List all 39 canonical permissions ordered by `module`, `action` (`?module=`) |
| `GET` | `/api/v1/roles/` | `roles.view` or `users.view/create/edit` | List roles with permissions and `user_count` (`?search=`) |
| `POST` | `/api/v1/roles/` | `roles.manage` | Create custom role with optional `permission_ids` (subset of actor scope) |
| `GET` | `/api/v1/roles/{id}/` | `roles.view` | Retrieve role detail |
| `PATCH` | `/api/v1/roles/{id}/` | `roles.manage` | Update custom role name, description, or permissions |
| `DELETE` | `/api/v1/roles/{id}/` | `roles.manage` | Delete non-system custom role |
| `PUT` | `/api/v1/roles/{id}/permissions/` | `roles.manage` | Assign role permissions (`{ "permission_ids": [...] }`) with anti-escalation checks |

### Security Audit Logs (`/api/v1/audit-logs/`)
| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/audit-logs/` | `audit.view` | Read-only paginated audit trail (`?action=`, `?target_type=`) |

### Catalog — Categories (`/api/v1/categories/`)
| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/categories/` | `products.view` | Paginated category list (`?page=`, `?page_size=`, `?search=`, `?is_active=true\|false`, `?parent=root\|<id>`) |
| `POST` | `/api/v1/categories/` | `products.create` | Create category (`name`, optional `name_km`, `slug`, `parent`, `description`, `is_active`) |
| `GET` | `/api/v1/categories/{id}/` | `products.view` | Retrieve category detail (includes `parent_name`, `children_count`, `is_in_use`) |
| `PATCH` | `/api/v1/categories/{id}/` | `products.edit` | Update category fields (blocks duplicate names & circular parent hierarchies) |
| `DELETE` | `/api/v1/categories/{id}/` | `products.delete` | Delete unused category (`204`); returns `409 Conflict` if referenced by subcategories or protected records |
| `POST` | `/api/v1/categories/{id}/activate/` | `products.edit` | Activate category |
| `POST` | `/api/v1/categories/{id}/deactivate/` | `products.edit` | Deactivate category |

## 4. Planned Future Endpoints (Not Yet Implemented)

- Catalog & Inventory: `/api/v1/units/`, `/api/v1/products/`, `/api/v1/inventory/`
- POS Sales: `/api/v1/sales/`, `/api/v1/sales/{id}/cancel/`, `/api/v1/sales/{id}/refund/`
- Customers, Suppliers, Purchasing, Expenses, Reports & Settings
