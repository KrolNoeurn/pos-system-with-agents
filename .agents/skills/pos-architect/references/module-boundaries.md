# POS Module Boundaries & Domain Map

Use this reference when planning new modules, placing new Django apps or React feature folders, or reviewing cross-module dependencies.

## Core Domain Modules

| Domain | Primary Ownership | Allowed Dependencies |
| :--- | :--- | :--- |
| `accounts` | User profiles, authentication (JWT login/refresh/logout), active status | `rbac`, `audit` |
| `rbac` | Roles, permissions (`module.action`), role-permission and user-role assignments | `audit` |
| `catalog` | Products, categories, units of measure, barcodes, pricing definitions | `rbac`, `audit` |
| `inventory` | Stock balances, stock movements/ledger, adjustments, low-stock thresholds | `catalog`, `rbac`, `audit` |
| `customers` | Customer directory, contact info, balance/loyalty metadata | `rbac` |
| `suppliers` | Supplier directory, contact info, purchase terms | `rbac` |
| `sales` | POS checkout, carts/orders, sale line snapshots, discounts, taxes, payments, refunds, cancellations | `catalog`, `inventory`, `customers`, `settings`, `rbac`, `audit` |
| `purchasing` | Purchase orders, goods receiving, supplier bills | `catalog`, `inventory`, `suppliers`, `rbac`, `audit` |
| `expenses` | Operational expense categories and expense entries | `rbac`, `audit` |
| `reports` | Read-only aggregations (sales, inventory, profit/loss, cashier shifts, tax summaries) | Read-only queries across domain modules |
| `settings` | Store profile, currency, tax defaults, receipt headers/footers, system preferences | `rbac`, `audit` |
| `audit` | Append-only security and financial audit event records | None (leaf infrastructure module) |

## Boundary Rules

1. **No circular imports:** Lower-level modules (`audit`, `rbac`, `catalog`) must never import from higher-level transactional modules (`sales`, `purchasing`, `reports`).
2. **Service-mediated writes:** `sales` and `purchasing` must update stock through `inventory.services` inside a shared `transaction.atomic()` block—never by mutating stock quantities directly.
3. **Immutable transaction snapshots:** `sales` line items must copy product name, SKU, unit price, cost snapshot, tax rate, and discount at checkout time so future `catalog` edits never rewrite financial history.
4. **Read-only reporting:** `reports` must not mutate transactional tables.
