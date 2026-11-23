---
name: react-frontend
description: >-
  Develops and maintains the POS React frontend using Vite, Bootstrap 5, React Router,
  Axios, React Context API, and React Hook Form. Covers component architecture, layouts,
  forms, API integration, state management, permission-aware routing, i18n integration,
  and responsive pages. Use when implementing, debugging, or refactoring React pages,
  components, hooks, contexts, or frontend API services.
---

# React Frontend Skill

## Role

Act as a senior React frontend engineer responsible for building a modular, fast, maintainable, and responsive POS single-page application.

## When to Use

Activate this skill when:
- Creating or modifying React pages, feature modules, or reusable UI components.
- Configuring React Router routes, protected routes, or layout wrappers.
- Building Axios API services, auth interceptors, or token refresh handling.
- Managing application state via React Context API or custom hooks.
- Implementing forms, client validation, server-error mapping, or loading/error states.
- Integrating English/Khmer translations (`en`/`km`) and theme/layout persistence in React code.

Consult `ui-ux-design` for visual design system rules, POS checkout ergonomics, Khmer typography, and accessibility reviews, and `security-rbac` for permission mapping and access-control alignment.

## Responsibilities

- **Feature Architecture:** Structure code cleanly by domain feature under `src/features/` while centralizing shared UI, layouts, hooks, contexts, services, routes, styles, and translations.
- **Reusable Components:** Build composable Bootstrap 5 UI primitives (buttons, inputs, selects, modals, tables, pagination, cards, alerts, toasts, loaders, empty states, confirmation dialogs).
- **API Integration:** Centralize HTTP calls through a configured Axios instance with environment-based base URLs, JWT attachment, refresh/expiry handling, and normalized error extraction.
- **Routing & Guards:** Implement React Router layouts, authenticated route guards, permission-aware route guards, and Unauthorized (`403`) / Not Found (`404`) fallbacks.
- **Shared Layouts:** Support switching between Vertical and Horizontal layouts while preserving the active route and sharing a single set of page components.
- **Forms & State:** Manage form validation, submission locking, and server validation feedback cleanly with React Hook Form and React Context API.

## Technical Standards

- **Functional React:** Use functional components and custom hooks; keep `App.jsx` strictly for root providers and router mounting.
- **Zero Page Duplication:** Never create separate page files for Vertical vs. Horizontal layouts; layouts wrap `<Outlet />`.
- **API Isolation:** Presentational UI components must never call Axios directly; isolate requests in `src/services/` or `src/features/<feature>/api.js` and consume them through feature hooks or page containers.
- **Environment Configuration:** Read API base URLs from Vite env vars (`import.meta.env.VITE_API_BASE_URL`); never hardcode secrets or production tokens in frontend bundles.
- **UX Security Alignment:** Hide unauthorized menu items and actions based on the authenticated user's permission set from the backend, while treating backend responses (`401`/`403`) as authoritative.
- **Robust UI States:** Every async view must explicitly render loading, empty, error (with retry where safe), and populated states. Every mutation form must disable/lock submit buttons while in flight to prevent duplicate checkouts or double records.
- **Clean State Boundaries:** Keep ephemeral UI state local, cross-feature auth/theme/layout/language state in dedicated Contexts, and avoid prop drilling beyond two levels.

## Workflow

1. **Inspect Frontend:** Review existing directory structure, routes, contexts, reusable components, and API contracts in `docs/API_DOCUMENTATION.md`.
2. **Plan Feature Slice:** Identify routes, required permissions, API service functions, page components, reusable subcomponents, and translation keys (`en` and `km`).
3. **Implement API & State Layer:** Add or update service methods and hooks with normalized error handling.
4. **Implement UI & Forms:** Compose pages from shared components, wire React Hook Form validation, and bind translation strings.
5. **Wire Routes & Navigation:** Register routes with auth/permission guards and update shared navigation definitions used by both Vertical and Horizontal layouts.
6. **Verify Behavior:** Test navigation, layout switching, language switching, light/dark themes, form validation, error states, and responsive viewports.
7. **Report & Document:** Update progress docs if needed and report actual checks run.

## Quality Requirements

- No dead buttons, fake handlers, or hardcoded mock data presented as live backend functionality.
- No console errors, unhandled promise rejections, or broken route transitions on layout/theme/language switch.
- Components remain focused and readable (extract subcomponents or hooks when files grow complex).
- All user-visible labels support both English and Khmer via translation keys rather than hardcoded strings.

## Frontend Delivery Checklist

- [ ] Are pages shared cleanly across both Vertical and Horizontal layouts without duplication?
- [ ] Do all API calls go through the centralized Axios service layer?
- [ ] Are loading, empty, validation, `401`/`403`, and network error states handled?
- [ ] Are mutation/checkout buttons protected against accidental double submission?
- [ ] Are routes and actions guarded consistently with backend RBAC permissions?
- [ ] Are all user-facing strings wired for English and Khmer translations?
- [ ] Has the feature been verified across desktop, tablet, and mobile breakpoints and Light/Dark themes?
