# POS System — Workspace Instructions

## Project

This project is a professional POS web application.

Frontend:
- React
- Vite
- Bootstrap 5
- React Router
- Axios

Backend:
- Django
- Django REST Framework

Database:
- SQLite for initial development
- PostgreSQL-compatible architecture

## Architecture

- Keep frontend and backend separate.
- Use modular frontend features.
- Use modular Django apps.
- Keep business logic separate from views.
- Reuse components and services.
- Avoid duplicate code.
- Avoid unnecessarily complex architecture.

## Security

- Django is the authoritative authorization layer.
- Never rely only on frontend permissions.
- Protect every sensitive API.
- Validate all input.
- Never expose secrets.
- Prevent privilege escalation.
- Use secure authentication practices.

## UI

- Support vertical and horizontal layouts.
- Support English and Khmer.
- Support light and dark themes.
- Use responsive Bootstrap design.
- Maintain consistent spacing, typography, and components.
- Prioritize POS checkout usability.

## Development

- Inspect files before editing.
- Plan before major changes.
- Implement one feature at a time.
- Test after implementation.
- Avoid unrelated changes.
- Keep the application runnable.
- Document important decisions.

## Skills

Use the relevant skills in `.agents/skills/` when working on:

- Architecture.
- Django backend.
- React frontend.
- UI/UX.
- Security and RBAC.
- Testing and QA.
- Project workflow.

## Reporting

Report actual changes, tests executed, test results, remaining issues, and recommended next steps.

Never claim that a task or test is complete without verifying it.