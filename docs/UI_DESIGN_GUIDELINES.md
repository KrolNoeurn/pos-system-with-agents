# UI Design Guidelines

> **Status:** Initial Design System Specification

## 1. Core UX Principles

- **Cashier Speed First:** Minimize clicks and page transitions during checkout; keep product search, barcode input, cart totals, and Pay action immediately accessible.
- **Clarity Over Decoration:** Clean retail-grade visual hierarchy using Bootstrap 5; never render non-functional decorative controls or fake widgets.
- **Consistent System:** Centralize spacing, colors, radii, shadows, and typography in CSS tokens rather than scattering component overrides.

## 2. Dual Navigation Layouts

Both layouts wrap the exact same React Router page components (`<Outlet />`) and preserve the active route when switched:

- **Vertical Layout (Default for Back-Office):**
  - Collapsible left sidebar with module groups and nested submenus.
  - Sticky topbar with breadcrumbs, quick POS launch button, language switcher (`EN` / `ខ្មែរ`), theme toggle (Light / Dark), layout switcher, and user menu.
  - Offcanvas drawer behavior on tablet/mobile breakpoints.
- **Horizontal Layout (Wide-Screen / POS-Friendly):**
  - Sticky top navigation bar with clean top-level links and structured dropdown submenus.
  - Full-width content workspace ideal for wide POS screens and tables.
  - Collapsible responsive navbar drawer on mobile.

## 3. Themes & Design Tokens

- Built on Bootstrap 5 `[data-bs-theme="light"]` and `[data-bs-theme="dark"]` extended with `--pos-*` CSS custom properties.
- Semantic tokens for surfaces (`--pos-bg-body`, `--pos-bg-surface`, `--pos-bg-sidebar`), borders (`--pos-border-subtle`), text (`--pos-text-primary`, `--pos-text-muted`), and status (`primary`, `success`, `warning`, `danger`, `info`).
- Maintain WCAG AA contrast (`>= 4.5:1` normal text, `>= 3:1` large text and UI controls) in both themes.

## 4. Bilingual Typography (English & Khmer)

- **Font Stack:** Clean Latin UI sans-serif paired with a dedicated Khmer UI font (`Noto Sans Khmer` or `Kantumruy Pro`).
- **Line Height:** `1.5` for English (`[lang="en"]`) and `1.65–1.75` for Khmer (`[lang="km"]`) to prevent clipping of stacked Khmer subscripts and diacritics.
- **Label Resilience:** Avoid fixed button/tab pixel widths; allow buttons, nav items, and table headers to expand or wrap cleanly with longer Khmer labels.
- **Tabular Numerals:** Apply `font-variant-numeric: tabular-nums` to all prices, quantities, and totals.

## 5. POS Checkout Ergonomics

- **Desktop Split View:** Product search/barcode bar + category filter + product grid on the left (~60–65%); live cart, customer selector, discount/tax breakdown, grand total, and payment action on the right (~35–40%).
- **Touch & Keyboard Ready:** Minimum `40–44px` hit targets on primary POS controls, clear `:focus-visible` outlines, keyboard barcode scan capture, and submission locking during checkout requests.

## 6. Required UI States

Every interactive page and component must cleanly handle:
1. Loading (spinner / skeleton)
2. Empty state (clear guidance + primary action if permitted)
3. Validation & server error feedback (field-level + summary alert/toast)
4. Permission-denied (`403`) and Not-Found (`404`) states
5. Confirmation dialogs for destructive or financial actions (void, refund, delete, deactivate)
