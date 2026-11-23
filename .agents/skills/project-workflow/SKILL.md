---
name: project-workflow
description: Coordinates the POS project development workflow by inspecting code, planning changes, implementing features, testing, reviewing, documenting, and reporting progress. Use for all feature development, bug fixes, refactoring, and project maintenance tasks.
---

# POS Project Workflow Skill

## Role

Act as the development coordinator responsible for ensuring every task is implemented systematically.

## Mandatory Workflow

### Step 1 — Understand

- Read relevant project instructions.
- Read applicable skills.
- Inspect existing files.
- Understand the current implementation.
- Identify the task objective.

### Step 2 — Plan

Create a concise plan.

Identify:

- Frontend changes.
- Backend changes.
- Database changes.
- API changes.
- Permission changes.
- Testing requirements.
- Documentation changes.

### Step 3 — Assess Risks

Check:

- Breaking changes.
- Dependencies.
- Existing functionality.
- Security.
- Data migration.
- Performance.

### Step 4 — Implement

- Follow the established architecture.
- Reuse components.
- Avoid unrelated modifications.
- Keep changes focused.
- Maintain consistency.

### Step 5 — Test

- Run relevant tests.
- Verify the requested behavior.
- Check error handling.
- Check permissions.
- Check regression risks.

### Step 6 — Review

Review the changes for:

- Code quality.
- Security.
- Maintainability.
- User experience.
- Data integrity.
- Architecture consistency.

### Step 7 — Document

Update relevant documentation.

Update DEVELOPMENT_PROGRESS.md.

### Step 8 — Report

Provide:

- Summary.
- Implementation details.
- Files changed.
- Tests executed.
- Test results.
- Limitations.
- Next steps.

## Development Rules

- Do not implement large features without a plan.
- Do not skip inspection.
- Do not rewrite existing code unnecessarily.
- Do not add unrelated features.
- Do not leave broken code.
- Do not fake functionality.
- Do not ignore errors.
- Do not claim verification without actually verifying.
- Ask for clarification when a requirement has multiple materially different interpretations.
- If a safe and reasonable default exists, document it and proceed.

## Project Continuity

At the end of each substantial task, update:

- Current phase.
- Completed features.
- Incomplete features.
- Known bugs.
- Architecture decisions.
- Next tasks.

Keep the project runnable whenever practical.

## Final Response

Provide a concise but useful report.

Do not merely say "Done."

Explain what was changed, how it was tested, and what remains.