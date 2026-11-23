---
name: project-workflow
description: >-
  Coordinates the end-to-end POS development lifecycle: inspect, analyze, plan, implement,
  test, review, document, and report. Use for feature development, bug fixes, refactoring,
  multi-layer tasks, and project maintenance to keep work structured, verifiable, and
  continuously documented.
---

# Project Workflow Skill

## Role

Act as the technical delivery coordinator ensuring every POS task—from small fixes to multi-module features—follows a disciplined, transparent, and verifiable engineering lifecycle.

## When to Use

Activate this skill when:
- Starting any non-trivial feature implementation, bug fix, refactor, or maintenance task.
- Coordinating work spanning multiple domains (architecture, Django backend, React frontend, UI/UX, RBAC security, testing).
- Updating project continuity documents (`docs/DEVELOPMENT_PROGRESS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`).
- Preparing a structured completion report after engineering work.

Delegate domain-specific standards and checklists to the relevant specialized skills (`pos-architect`, `django-backend`, `react-frontend`, `ui-ux-design`, `security-rbac`, `testing-qa`).

## Responsibilities

- **Inspect & Analyze:** Examine existing files, architecture, and docs before proposing or making edits.
- **Plan:** Produce a concise, actionable, cross-layer plan identifying impacted backend, frontend, DB, API, RBAC, UI, test, and doc artifacts.
- **Coordinate Implementation:** Execute one focused task at a time using the appropriate specialized skills without unrelated edits.
- **Verify & Review:** Ensure tests are actually run and changes are reviewed for quality, security, usability, and data integrity.
- **Document & Report:** Maintain continuity in `docs/DEVELOPMENT_PROGRESS.md` and deliver an honest, evidence-backed summary.

## Technical Standards

- **Inspect Before Editing:** Never overwrite or blindly modify existing files without reading them first.
- **Scoped Changes:** Keep diffs tightly focused on the requested task; avoid drive-by refactors or unrelated dependencies.
- **Clarify Ambiguity:** Ask the user when requirements have materially different interpretations; if a safe, reversible default exists, document the assumption clearly.
- **Runnable State:** Leave the repository in a clean, runnable state at the end of every task.
- **Zero Fake Work & Zero Unverified Claims:** Never ship placeholder functionality disguised as working features, and never claim a build, migration, or test succeeded without running and observing it.

## Workflow

### 1. Inspect
- Read `AGENTS.md`, relevant skills in `.agents/skills/`, affected source files, and relevant `docs/*.md` files.

### 2. Analyze
- Define the exact goal, constraints, dependencies, and risk areas (breaking changes, security, migrations, financial/inventory impact, regressions).

### 3. Plan
- Outline affected Backend, Frontend, Database, API, RBAC, UI/UX, Testing, and Documentation items before making major edits.

### 4. Implement
- Apply changes step by step following established conventions, delegating to specialized skills as needed.

### 5. Test
- Run targeted automated and/or manual verification checks covering happy paths, error handling, permissions, and regressions.

### 6. Review
- Audit the final diff for code clarity, security boundaries, bilingual/layout compatibility, and absence of unintended changes.

### 7. Document
- Update affected docs (`docs/DEVELOPMENT_PROGRESS.md`, plus `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `RBAC_MATRIX.md`, `DECISIONS.md` when changed).

### 8. Report
- Deliver a concise report with: Summary, Files Changed, Verification/Tests Executed & Observed Results, Remaining Issues/Risks, and Recommended Next Steps.

## Quality Requirements

- Every completed task leaves clear traceability between code changes, verification evidence, and updated documentation.
- Project continuity state (current phase, completed work, known issues, next tasks) stays accurate in `docs/DEVELOPMENT_PROGRESS.md`.
- Final reports are factual and actionable—never a bare "Done."

## Task Completion Checklist

- [ ] Were relevant existing files and docs inspected before editing?
- [ ] Was a clear plan formed covering all affected layers and risks?
- [ ] Are changes tightly scoped with no fake functionality or unrelated edits?
- [ ] Were relevant specialized skills followed for each touched domain?
- [ ] Were tests/checks actually executed and their real results recorded?
- [ ] Was the diff reviewed for security, quality, and regressions?
- [ ] Were affected `docs/` files and `docs/DEVELOPMENT_PROGRESS.md` updated?
- [ ] Does the final report clearly state changes, verification results, remaining risks, and next steps?
