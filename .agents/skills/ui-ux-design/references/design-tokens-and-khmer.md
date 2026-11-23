# Design Tokens, Themes & Khmer Typography

Reference for maintaining visual consistency across Light/Dark themes, Bootstrap 5 components, and English/Khmer screens.

## Theme Architecture

- Use Bootstrap 5.3+ native theme attribute (`data-bs-theme="light"` / `data-bs-theme="dark"`) paired with custom POS CSS variables (`--pos-*`) defined in a single theme stylesheet.
- Core semantic token groups:
  - **Surfaces:** `--pos-bg-body`, `--pos-bg-surface`, `--pos-bg-elevated`, `--pos-bg-sidebar`, `--pos-bg-topbar`
  - **Borders & Dividers:** `--pos-border-subtle`, `--pos-border-strong`
  - **Text:** `--pos-text-primary`, `--pos-text-secondary`, `--pos-text-muted`
  - **Semantic Status:** `--pos-primary`, `--pos-success` (paid/in-stock), `--pos-warning` (low-stock/pending), `--pos-danger` (void/out-of-stock/error), `--pos-info`
  - **Layout Dimensions:** `--pos-sidebar-width` (e.g., `260px`), `--pos-sidebar-collapsed-width` (e.g., `72px`), `--pos-topbar-height` (e.g., `60px`)

## Khmer & English Typography Rules

- **Font Stack:** Pair a clean Latin sans-serif (e.g., `Inter` or system sans-serif) with a clear Khmer UI font (`Noto Sans Khmer` or `Kantumruy Pro`).
- **Line Height:** Set body `line-height` to `1.5` for English and `1.65`–`1.75` when `[lang="km"]` is active to prevent vertical clipping of stacked Khmer subscripts (`ជើង`) and upper/lower vowel signs.
- **Flexible Containers:** Avoid rigid pixel widths on buttons, tabs, badges, and table headers; use `min-width`, padding, and graceful wrapping or ellipsis with tooltips where appropriate.
- **Numeric Tabular Alignment:** Apply `font-variant-numeric: tabular-nums;` on prices, quantities, totals, and financial table columns so decimal points align cleanly.

## POS Checkout Screen Ergonomics

- **Two-Pane Desktop Layout:** Left pane (~60–65%) for fast barcode/text search, category pills, and product grid; right pane (~35–40%) for sticky cart, customer selector, discount/tax breakdown, grand total, and checkout action.
- **High-Frequency Controls:** Large `+` / `-` quantity steppers, one-click tender presets, and clear change-due readout.
- **Tablet/Mobile Fallback:** Switch cleanly to a tabbed or bottom-drawer cart view without hiding the item count or grand total.
