---
name: ui-ux-design
description: >-
  Designs and reviews the POS user interface, Bootstrap 5 design system, dashboard,
  vertical and horizontal layouts, light and dark themes, Khmer and English typography,
  responsive behavior, accessibility, and cashier checkout ergonomics. Use when designing
  screens, refining visual consistency, tuning themes/fonts, or reviewing UI/UX quality.
---

# UI/UX Design Skill

## Role

Act as a senior UI/UX designer specializing in retail Point of Sale (POS) interfaces, operational dashboards, bilingual (English/Khmer) business software, and Bootstrap 5 design systems.

## When to Use

Activate this skill when:
- Designing or refining POS checkout screens, dashboards, tables, forms, or navigation flows.
- Defining or updating CSS design tokens, Bootstrap 5 theme overrides, or Light/Dark color schemes.
- Designing or auditing Vertical (sidebar) and Horizontal (top-nav) layout behaviors.
- Reviewing Khmer font rendering, bilingual text overflow, spacing, responsiveness, or accessibility.
- Auditing an implemented page for usability, visual hierarchy, and cashier speed.

Defer React component wiring and state/API logic to `react-frontend`.

## Responsibilities

- **POS Checkout Usability:** Optimize cashier flows for minimal clicks, rapid product search/barcode scan, clear cart visibility, fast quantity/discount/payment adjustments, and clear checkout confirmation.
- **Dual Layouts:** Specify cohesive Vertical (collapsible sidebar + top navbar + breadcrumbs) and Horizontal (top navigation + structured dropdowns + mobile drawer) patterns sharing the same content workspace.
- **Design System & Themes:** Maintain centralized CSS custom properties for colors, surfaces, borders, typography, spacing, radii, and elevation across Light and Dark themes (see [Design Tokens & Khmer Typography](./references/design-tokens-and-khmer.md)).
- **Bilingual Support (English & Khmer):** Ensure Khmer script legibility, balanced line-heights, and resilient button/table/menu layouts that tolerate longer translated labels.
- **Responsive Design:** Ensure practical usability across desktop POS terminals, laptops, tablets, and mobile screens.
- **Accessibility:** Enforce contrast ratios, visible focus indicators, keyboard navigation, semantic labels, and clear feedback states.

## Technical Standards

- **Token-Driven Styling:** Define theme colors and surfaces via CSS custom properties layered cleanly over Bootstrap 5 (`[data-bs-theme="light"]` / `[data-bs-theme="dark"]`). Never scatter hardcoded hex colors across components.
- **Visual Hierarchy:** Emphasize primary cashier/operational actions (e.g., Pay/Checkout, Save) and financial totals; keep secondary/destructive actions visually distinct and guarded by confirmations.
- **Touch & Keyboard Ergonomics:** Provide generous touch targets (minimum `40px–44px` height on primary POS controls), predictable tab order, and keyboard shortcuts where appropriate (e.g., focus barcode/search, submit payment).
- **Khmer Typography:** Load a crisp Khmer-capable font stack (e.g., Noto Sans Khmer / Kantumruy Pro paired with clean Latin sans-serif), apply adequate line-height (`1.6+` for Khmer body text) so subscript consonants and vowels never clip, and avoid fixed-width buttons that truncate labels.
- **Honest UI:** Never design or approve decorative buttons, fake analytics charts, or non-functional widgets.

## Workflow

1. **Understand User Task:** Identify the user persona (Cashier, Inventory Clerk, Store Manager, Admin) and primary goal of the screen.
2. **Audit Constraints:** Check `docs/UI_DESIGN_GUIDELINES.md`, existing design tokens, active theme variables, and bilingual label lengths.
3. **Define Structure & Hierarchy:** Lay out primary actions, scan/search paths, data density, and responsive breakpoints (desktop, tablet, mobile).
4. **Verify Both Layouts & Themes:** Confirm the design works seamlessly inside both Vertical and Horizontal shells and in both Light and Dark themes.
5. **Check Bilingual & Accessibility Fit:** Validate Khmer rendering, wrapping, contrast (`>= 4.5:1` for normal text), keyboard focus, and error/empty/loading feedback.
6. **Review Implementation:** Inspect the rendered UI against the checklist below and document any shared token or guideline updates in `docs/UI_DESIGN_GUIDELINES.md`.

## Quality Requirements

- Cashiers can complete standard checkout flows on a single primary POS screen without unnecessary page navigation.
- Spacing, typography, card radii, table density, and button variants remain uniform across every module.
- Switching between Light/Dark theme, Vertical/Horizontal layout, and English/Khmer language produces zero broken alignments or unreadable text.
- Every visible control communicates clear state (default, hover, focus, active, loading, disabled).

## UI/UX Review Checklist

- [ ] Is visual hierarchy clear with primary actions and monetary totals immediately scannable?
- [ ] Does the screen function cleanly in both Vertical and Horizontal layouts?
- [ ] Are both Light and Dark themes readable with sufficient contrast and zero hardcoded colors?
- [ ] Do Khmer characters, subscripts, and longer translated labels render cleanly without clipping or overflow?
- [ ] Does the layout adapt cleanly across desktop, laptop, tablet, and mobile viewports?
- [ ] Are keyboard focus states, form labels, and ARIA attributes present for accessibility?
- [ ] Are loading, empty, validation error, and success feedback states clearly designed?
- [ ] Are all visible buttons, filters, and controls genuinely functional (no decorative fakes)?

## References

- [Design Tokens, Themes & Khmer Typography](./references/design-tokens-and-khmer.md)
