# Architecture Decision Records (ADRs)

Record significant architectural, technical, security, and design decisions here so future work remains consistent and well-justified.

---

## ADR-001: Decoupled React + Vite SPA and Django + DRF Backend
- **Date:** 2026-11-23
- **Status:** Accepted
- **Context:** The POS application requires a fast, interactive cashier UI (bilingual, dual layouts, themes) paired with a secure, auditable transactional backend.
- **Decision:** Keep `frontend/` (React, Vite, Bootstrap 5, React Router, Axios, Context API, React Hook Form) and `backend/` (Django, DRF) completely decoupled over versioned `/api/v1/` JSON endpoints with JWT authentication.
- **Consequences:** Enables independent frontend/backend testing, clear API contracts, and clean separation of concerns; requires disciplined API documentation and CORS/JWT handling.

## ADR-002: SQLite for Initial Development with PostgreSQL-Compatible Design
- **Date:** 2026-11-23
- **Status:** Accepted
- **Context:** Local development should remain zero-friction while ensuring smooth migration to PostgreSQL for production retail workloads.
- **Decision:** Use SQLite initially, while enforcing PostgreSQL-compatible Django ORM conventions (`DecimalField` for money, explicit constraints, timezone-aware timestamps, no SQLite-only raw SQL).
- **Consequences:** Fast local onboarding with minimal migration friction later; concurrency locking behavior (`select_for_update`) must be verified when moving to PostgreSQL.

## ADR-003: Server-Side Authoritative RBAC (`<module>.<action>`)
- **Date:** 2026-11-23
- **Status:** Accepted
- **Context:** Retail POS systems handle cash, discounts, refunds, pricing, and inventory adjustments that are high-risk targets for misuse or privilege escalation.
- **Decision:** Model explicit Roles and `<module>.<action>` Permissions enforced authoritatively in Django DRF views/services, with React guards acting strictly as UX enhancements.
- **Consequences:** Eliminates client-side bypass risks; requires keeping `docs/RBAC_MATRIX.md` and automated negative security tests up to date.

## ADR-004: Shared Page Components Across Vertical and Horizontal Layouts
- **Date:** 2026-11-23
- **Status:** Accepted
- **Context:** Users need to switch between a Vertical sidebar layout and a Horizontal top-navigation layout without losing context or maintaining duplicated screens.
- **Decision:** Implement `VerticalLayout` and `HorizontalLayout` as interchangeable React Router shell wrappers around shared `<Outlet />` page components and a single navigation config.
- **Consequences:** Zero duplicated page code and seamless route preservation on layout switching.

## ADR-005: Workspace Agent Skills Convention (`.agents/skills/`)
- **Date:** 2026-11-23
- **Status:** Accepted
- **Context:** Multi-layer POS engineering benefits from specialized, reusable agent instructions without bloating always-on context.
- **Decision:** Store seven focused workspace skills under `.agents/skills/<skill-name>/SKILL.md` with progressive-disclosure `references/` files and concise workspace rules in root `AGENTS.md`.
- **Consequences:** Aligns with current Antigravity workspace discovery while keeping context lean and responsibilities cleanly partitioned.

---

## Template for Future Decisions

```markdown
## ADR-XXX: <Decision Title>
- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded
- **Context:** What problem or constraint prompted this decision?
- **Decision:** What was chosen?
- **Alternatives Considered:** What other options were evaluated and why were they rejected?
- **Consequences:** Trade-offs, migration needs, and follow-up actions.
```
