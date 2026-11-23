# POS Test Matrix & QA Report Template

Reference for verifying critical POS scenarios and reporting QA outcomes consistently.

## Critical POS & Financial Test Matrix

| Area | Must-Verify Scenarios |
| :--- | :--- |
| **Cart & Checkout** | Add item, increment/decrement quantity, remove item, barcode lookup, empty-cart rejection, duplicate checkout / idempotency guard |
| **Financial Math** | Line subtotal (`qty * unit_price`), fixed & percentage discounts, tax calculation & `ROUND_HALF_UP` rounding, grand total, payment tendered, exact change due, insufficient payment rejection |
| **Inventory Integrity** | Atomic stock deduction on checkout, oversell/negative-stock rejection, stock restoration on authorized cancellation/refund, rollback when payment or stock check fails mid-transaction |
| **RBAC & Security** | Unauthenticated (`401`), missing permission (`403`), inactive user blocked, privilege escalation blocked, audit log written for sensitive actions |
| **Frontend UX** | Form validation & server error display, submit lock during request, layout switch preserves active route, Light/Dark theme & English/Khmer rendering without overflow |

## QA Report Template

```markdown
### QA Verification Report
- **Scope:** <feature or fix>
- **Commands Executed:** `<exact command>`
- **Results:** <passed / failed / skipped counts>
- **Findings / Defects:**
  - Case: <test case> | Expected: <expected> | Actual: <actual> | Status: <PASS/FAIL/BLOCKED>
- **Regression Check:** <affected modules verified>
- **Unverified / Blockers:** <anything not executed and why>
```
