---
name: react-frontend
description: Develops the POS React frontend using Vite, Bootstrap, React Router, Axios, Context API, reusable components, responsive layouts, forms, API integration, and frontend state management. Use when implementing or modifying frontend pages and components.
---

# React Frontend Skill

## Role

Act as a senior React frontend engineer.

Build a professional, maintainable POS frontend.

## Technology

- React
- Vite
- Bootstrap 5
- Bootstrap Icons
- React Router
- Axios
- React Context API
- React Hook Form

## Architecture

Use feature-based architecture.

Separate:

- Pages.
- Components.
- Layouts.
- Hooks.
- Contexts.
- API services.
- Utilities.
- Routes.
- Styles.
- Translations.

Do not place the entire application in App.jsx.

## Components

Create reusable components for:

- Buttons.
- Inputs.
- Selects.
- Modals.
- Tables.
- Pagination.
- Dropdowns.
- Cards.
- Alerts.
- Toasts.
- Loading indicators.
- Empty states.
- Confirmations.

Avoid duplicated components with similar responsibilities.

## API Integration

- Use a centralized Axios instance.
- Configure base API URLs using environment variables.
- Use centralized authentication handling.
- Handle loading, success, and error states.
- Avoid direct API calls inside reusable UI components.
- Handle expired authentication appropriately.
- Do not expose secrets in frontend code.

## Routing

- Use React Router.
- Implement protected routes.
- Implement permission-aware routes.
- Implement proper fallback pages.
- Implement unauthorized and not-found pages.

## Layouts

Support:

- Vertical layout.
- Horizontal layout.

Both layouts must use shared page components.

Do not duplicate pages to support different layouts.

Layout switching must preserve the active route where possible.

## Responsive Design

Support:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

Prioritize desktop POS usability while ensuring responsive administrative pages.

## Forms

Use React Hook Form where appropriate.

Implement:

- Required field validation.
- Validation messages.
- Loading states.
- Submission handling.
- Server-side error display.
- Prevent accidental duplicate submission.

## Permissions

Frontend permissions improve usability but do not replace backend security.

- Hide unauthorized navigation.
- Hide unauthorized actions.
- Protect pages.
- Display access-denied states.

## Code Quality

- Prefer functional components.
- Use custom hooks when useful.
- Keep components focused.
- Avoid excessive prop drilling.
- Avoid giant components.
- Avoid duplicated logic.
- Do not introduce unnecessary dependencies.

## Workflow

1. Inspect the existing frontend.
2. Identify the feature and dependencies.
3. Plan components and routes.
4. Implement reusable UI.
5. Connect to API services.
6. Implement validation and error states.
7. Test behavior.
8. Check responsive design.
9. Update documentation.
10. Report the result.