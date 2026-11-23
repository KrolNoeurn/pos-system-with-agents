# UI Design Guidelines

> **Status:** Phase 4 Implemented — Design Tokens, Vertical & Horizontal Layouts, Light/Dark Themes, Khmer-Safe Typography & Shared UI Primitives Active

## 1. Core UX Principles

- **Clarity Over Decoration:** Clean retail-grade visual hierarchy using Bootstrap 5 and Bootstrap Icons; zero non-functional decorative widgets.
- **Centralized Design System:** All colors, surfaces, borders, radii, shadows, spacing, and layout dimensions are defined in [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css) and [`frontend/src/config/themeConfig.js`](../frontend/src/config/themeConfig.js).
- **Zero Duplicated Pages:** Both Vertical and Horizontal layouts render the exact same route pages via React Router `<Outlet />` inside [`AppShell.jsx`](../frontend/src/layouts/AppShell.jsx).

## 2. Implemented Navigation Layouts

Both layouts consume [`frontend/src/config/navigation.js`](../frontend/src/config/navigation.js) with recursive permission filtering (`filterNavigationByPermission`) and shared breadcrumb resolution (`resolveBreadcrumbs`):

- **Vertical Layout (`frontend/src/layouts/VerticalLayout.jsx`):**
  - Left sidebar with **Expanded** (`260px`), **Mini** (`74px` icon rail with hover titles), and **Collapsed** (`0px`) desktop modes.
  - Responsive mobile slide-over drawer + backdrop on viewports `< 992px`.
  - Collapsible nested menu groups with active-route auto-expansion.
  - Sticky top navbar with sidebar mode toggle, Breadcrumbs, Language (`EN`/`ខ្មែរ`), Layout switcher, Theme toggle, and User menu.
- **Horizontal Layout (`frontend/src/layouts/HorizontalLayout.jsx`):**
  - Sticky top navigation bar with brand Logo, direct links, and accessible nested Dropdown menus.
  - Responsive mobile collapse navigation on viewports `< 992px`.
  - Dedicated breadcrumb sub-bar and shared `HeaderControls`.

## 3. Themes & User Preferences

- Implemented via `PreferencesContext` (`frontend/src/contexts/PreferencesContext.jsx`):
  - **Themes:** Light (`data-bs-theme="light"`) and Dark (`data-bs-theme="dark"`).
  - **Persistence:** Saved immediately to `localStorage` and synced to `PATCH /api/v1/auth/me/` (`preferred_theme`, `preferred_layout`, `preferred_language`) when authenticated.

## 4. Bilingual Typography (English & Khmer)

- Font stack pairs Latin sans-serif (`Inter`, system UI) with Khmer UI fonts (`Noto Sans Khmer`, `Kantumruy Pro`, `Khmer OS Battambang`).
- Switching language sets `<html lang="km">` or `<html lang="en">`, automatically increasing body `line-height` to `1.72` for Khmer script so stacked subscripts and diacritics never clip.
- Flexible flex/grid spacing prevents overflow on longer Khmer labels; `.pos-tabular` applies `font-variant-numeric: tabular-nums`.

## 5. Reusable UI Component Primitives (`frontend/src/components/ui/`)

- `PageHeader` — Standardized title, subtitle, icon, badge, and responsive actions bar.
- `AppCard` — Consistent surface container with optional header, subtitle, actions, and footer.
- `DataTable` — Reusable responsive table with integrated Loading, Error (with Retry), Empty, and Populated states.
- `FormControls` (`FormInput`, `FormSelect`, `FormTextarea`, `FormActions`) — Standardized labels, required indicators, invalid feedback, helper text, and submit-lock buttons.
- `AppModal` — Accessible modal dialog (`sm`, `md`, `lg`) with Escape & backdrop close controls.
- `ToastProvider` / `useToast` — Floating accessible notification stack (`success`, `danger`, `warning`, `info`).
- `ConfirmProvider` / `useConfirm` — Promise-based confirmation dialog replacing browser `window.confirm`.
- `LoadingState`, `EmptyState`, `ErrorState`, `StatusAlert` — Uniform async feedback states.
