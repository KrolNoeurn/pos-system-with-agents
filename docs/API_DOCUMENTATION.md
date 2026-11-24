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
| `GET` | `/api/v1/audit-logs/` | `audit.view` | Read-only append-only paginated audit trail (`?search=`, `?action=`, `?target_type=`, `?actor=`, `?date_from=`, `?date_to=`) |

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

### Catalog — Units (`/api/v1/units/`)
| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/units/` | `products.view` | Paginated unit list (`?page=`, `?page_size=`, `?search=`, `?unit_type=`, `?is_active=true\|false`) |
| `POST` | `/api/v1/units/` | `products.create` | Create unit (`name`, `abbreviation`, `unit_type`, optional `name_km`, `allow_decimal`, `base_unit`, `conversion_factor`, `is_active`) |
| `GET` | `/api/v1/units/{id}/` | `products.view` | Retrieve unit detail (includes `base_unit_abbreviation`, `derived_count`, `is_in_use`) |
| `PATCH` | `/api/v1/units/{id}/` | `products.edit` | Update unit (validates unique name/abbreviation, positive factor, matching `unit_type`, no cycles) |
| `DELETE` | `/api/v1/units/{id}/` | `products.delete` | Delete unused unit (`204`); returns `409 Conflict` if referenced by derived units or products |
| `POST` | `/api/v1/units/{id}/activate/` | `products.edit` | Activate unit |
| `POST` | `/api/v1/units/{id}/deactivate/` | `products.edit` | Deactivate unit |

### Catalog — Products (`/api/v1/products/`)
| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products/` | `products.view` | Paginated product list (`?page=`, `?page_size=`, `?search=`, `?category=`, `?unit=`, `?is_active=`, `?min_price=`, `?max_price=`, `?ordering=name\|-name\|selling_price\|-selling_price\|sku\|-created_at`) |
| `POST` | `/api/v1/products/` | `products.create` | Create product (JSON or `multipart/form-data` with optional image upload; exact `Decimal` pricing; no editable stock field) |
| `GET` | `/api/v1/products/{id}/` | `products.view` | Retrieve product detail (includes `category_name`, `unit_abbreviation`, `image_url`) |
| `PATCH` | `/api/v1/products/{id}/` | `products.edit` (+ `products.edit_price` for price changes) | Update product details, optional image replacement/`remove_image=true`, and audited price edits |
| `DELETE` | `/api/v1/products/{id}/` | `products.delete` | Delete unused product (`204`); returns `409 Conflict` if referenced in historical transactions (`ProtectedError`) |
| `POST` | `/api/v1/products/{id}/activate/` | `products.edit` | Activate product |
| `POST` | `/api/v1/products/{id}/deactivate/` | `products.edit` | Deactivate product |

### Inventory Management (`/api/v1/inventory/`)
> Balances and movement history are strictly read-only. All stock mutations pass through validated, atomic movement endpoints.

| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/inventory/balances/` | `inventory.view` | Paginated tracked product balances, avg cost, valuation, status (`?search=`, `?category=`, `?stock_status=in_stock\|low_stock\|out_of_stock`, `?low_stock=true`) |
| `GET` | `/api/v1/inventory/low-stock/` | `inventory.view` | Paginated low-stock & out-of-stock alerts with shortage quantities |
| `GET` | `/api/v1/inventory/movements/` | `inventory.view` | Paginated immutable movement ledger (`?product=`, `?movement_type=`, `?search=`, `?date_from=`, `?date_to=`) |
| `POST` | `/api/v1/inventory/opening-stock/` | `inventory.adjust` | Record one-time opening stock (`409` if movements already exist) |
| `POST` | `/api/v1/inventory/stock-in/` | `inventory.adjust` | Record inbound stock receipt with moving-average valuation update |
| `POST` | `/api/v1/inventory/stock-out/` | `inventory.adjust` | Record outbound stock deduction (blocks negative stock unless `INVENTORY_ALLOW_NEGATIVE_STOCK=True`) |
| `POST` | `/api/v1/inventory/adjustments/` | `inventory.adjust` | Record signed stock adjustment (`direction`: `increase`\|`decrease`, mandatory `notes`) |
| `POST` | `/api/v1/inventory/import-adjust/` | `inventory.adjust` | Atomic bulk CSV stock import & adjustment (`sku,operation,quantity,unit_cost,reference_code,notes` + optional `partner_type`/`partner_name`); rolls back entire batch on any row error |
| `GET` | `/api/v1/inventory/report/` | `inventory.view` or `reports.view` | Live inventory valuation report (totals, category valuation breakdown, movement summary by type) |

### Suppliers & Purchasing (`/api/v1/suppliers/`, `/api/v1/purchases/`)
> Purchase drafts never alter stock. Goods receiving atomically updates stock via `apps.inventory.services` and blocks duplicate receiving (`409 Conflict`).

| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` / `POST` / `PATCH` | `/api/v1/suppliers/` | `suppliers.view` (or `purchases.view/create`) / `suppliers.create` / `suppliers.edit` | Manage supplier directory |
| `POST` | `/api/v1/suppliers/{id}/activate/` & `/deactivate/` | `suppliers.edit` | Activate or deactivate supplier record |
| `POST` | `/api/v1/suppliers/import-csv/` | `suppliers.create` | Atomically bulk import/update suppliers from CSV (`file` or `csv_text`) |
| `GET` | `/api/v1/purchases/` | `purchases.view` | Paginated purchase history (`?search=`, `?supplier=`, `?status=draft\|ordered\|received\|cancelled`) |
| `POST` | `/api/v1/purchases/` | `purchases.create` | Create Draft/Ordered purchase with server-side `Decimal` totals (stock unchanged) |
| `GET` | `/api/v1/purchases/{id}/` | `purchases.view` | Retrieve purchase details & immutable line-item snapshots |
| `PATCH` | `/api/v1/purchases/{id}/` | `purchases.create` | Edit Draft/Ordered purchase (`409` if already received or cancelled) |
| `POST` | `/api/v1/purchases/{id}/receive/` | `purchases.receive` | Atomically receive goods, create `PURCHASE` stock movements, update weighted-average cost (`409` on duplicate or cancelled) |
| `POST` | `/api/v1/purchases/{id}/cancel/` | `purchases.cancel` | Cancel Draft/Ordered purchase (`409` if already received or cancelled) |

### Customers & POS Sales (`/api/v1/customers/`, `/api/v1/sales/`)
> Server-authoritative `Decimal` pricing, proportional discount & tax calculation, `X-Idempotency-Key` / `idempotency_key` replay protection, immutable sale snapshots, and atomic stock deduction (`SALE`) / restoration (`VOID`, `REFUND`) via `apps.inventory.services`.

| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` / `POST` / `PATCH` | `/api/v1/customers/` | `customers.view` (or `sales.view/create`) / `customers.create` / `customers.edit` | Manage customer directory (no hard delete) |
| `POST` | `/api/v1/customers/{id}/activate/` & `/deactivate/` | `customers.edit` | Activate or deactivate customer record |
| `POST` | `/api/v1/customers/import-csv/` | `customers.create` | Atomically bulk import/update customers from CSV (`file` or `csv_text`) |
| `GET` | `/api/v1/sales/catalog/` | `sales.create` or `sales.view` | Active POS product lookup with barcode/SKU/name search, category filter, and read-only live stock availability |
| `GET` | `/api/v1/sales/` | `sales.view` | Paginated sales history (`?search=`, `?status=`, `?payment_method=`, `?customer=`, `?date_from=`, `?date_to=`) |
| `POST` | `/api/v1/sales/` | `sales.create` (+ `sales.discount` if `discount_amount > 0`) | Atomic POS checkout (`201 Created`; `200 OK` on idempotent replay; rolls back completely on insufficient stock) |
| `GET` | `/api/v1/sales/{id}/` | `sales.view` | Retrieve full immutable sale detail & receipt payload (items, payments, totals, cashier, customer) |
| `POST` | `/api/v1/sales/{id}/cancel/` | `sales.cancel` | Atomically void completed sale (requires `reason`), restore stock (`VOID` movement), block duplicates (`409`) |
| `POST` | `/api/v1/sales/{id}/refund/` | `sales.refund` | Atomically refund completed sale (requires `reason`), restore stock (`REFUND` movement), block duplicates (`409`) |

### Expenses & Cash Flow (`/api/v1/expense-categories/`, `/api/v1/expenses/`)
> All expense mutations record sanitized audit logs. Expense categories in use are protected from deletion (`409 Conflict`).

| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/v1/expense-categories/` | `expenses.view` (or `reports.view`) / `expenses.create` / `expenses.edit` / `expenses.delete` | Manage expense categories (`409` on delete if referenced by expenses) |
| `GET` | `/api/v1/expenses/` | `expenses.view` | Paginated expenses list (`?search=`, `?category=`, `?payment_method=`, `?date_from=`, `?date_to=`) |
| `POST` / `PATCH` / `DELETE` | `/api/v1/expenses/` | `expenses.create` / `expenses.edit` / `expenses.delete` | Record, edit, or delete operating expenses with full audit trail |
| `GET` | `/api/v1/expenses/summary/` | `expenses.view` or `reports.view` | Exact `Decimal` cash flow summary (`sales_inflow`, `purchasing_outflow`, `expense_outflow`, `net_cash_flow`) and category/payment breakdowns (`?date_from=`, `?date_to=`) |

### Store Settings & Telegram Backup Control (`/api/v1/settings/`, `/api/v1/settings/backups/`)
| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/settings/` | `settings.view` | Retrieve singleton store identity, currency/exchange rate, default tax, and receipt configuration |
| `PATCH` / `PUT` | `/api/v1/settings/` | `settings.edit` | Atomically update store settings with validation and `settings.updated` audit log |
| `GET` | `/api/v1/settings/receipt-profile/` | Authenticated (Active) | Read-only non-sensitive receipt branding subset (store name, phone, address, KHR rate, header/footer) used by POS cashiers |
| `GET` / `PATCH` | `/api/v1/settings/backups/` | `settings.view` / `settings.edit` | Read or update crontab schedule, DB/media scope, retention count, and Telegram Bot configuration (token is write-only and masked in responses; returns next 3 scheduled runs and copyable server crontab lines) |
| `POST` | `/api/v1/settings/backups/test-telegram/` | `settings.edit` | Verify Telegram Bot token (`getMe`) and send test message (`sendMessage`) |
| `POST` | `/api/v1/settings/backups/run/` | `settings.edit` | Execute an immediate database + media `.zip` backup and optional Telegram delivery (auto-splits >45 MB archives) |
| `GET` | `/api/v1/settings/backups/runs/` | `settings.view` | Paginated history of manual and scheduled backup executions |
| `GET` | `/api/v1/settings/backups/runs/{id}/download/` | `settings.view` | Download retained local `.zip` backup archive (`backup.downloaded` audit log) |

> **Profile Images:** `PATCH /api/v1/auth/me/` and `POST/PATCH /api/v1/users/` accept `multipart/form-data` with `avatar` (PNG/JPG/WebP <= 5 MB) or `remove_avatar=true`, and return `avatar` + absolute `avatar_url`.

### Dashboard KPIs & Reports (`/api/v1/reports/`)
> All financial metrics use exact `Decimal` aggregation. CSV exports neutralize spreadsheet formula injection and log `report.exported` in `audit_logs`.

| Method | Endpoint | Required Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/reports/dashboard/` | `dashboard.view` | Real-time store KPIs (today/MTD sales, MTD expenses, low-stock count, pending POs), recent 5 sales, and top 5 low-stock products |
| `GET` | `/api/v1/reports/sales/` | `reports.view` | Sales summary, daily breakdown, payment breakdown, and top-15 products with COGS & gross profit (`?date_from=`, `?date_to=`) |
| `GET` | `/api/v1/reports/profit-loss/` | `reports.view` | Exact `Decimal` Profit & Loss statement (gross/net sales, COGS from `SaleItem.unit_cost_snapshot`, gross profit/margin, operating expenses, net profit/margin) (`?date_from=`, `?date_to=`) |
| `GET` | `/api/v1/reports/purchasing/` | `reports.view` | Purchase order summary by status and received spend by supplier (`?date_from=`, `?date_to=`) |
| `GET` | `/api/v1/reports/export/` | `reports.export` | Authorized CSV download (`?type=sales\|pnl\|inventory\|purchasing`, `?date_from=`, `?date_to=`) with audit logging |

## 4. Planned Future Endpoints (Not Yet Implemented)

- *(All planned v1 POS domain APIs are now implemented.)*
