# Falcon Campus OS — Missing Documentation Report

Items that **cannot be fully documented** from the current codebase without speculation, or that remain **partially documented** by design.

---

## Cannot document (not implemented)

| Topic | Reason | Workaround in docs |
|-------|--------|-------------------|
| Global API rate limiting | No NestJS `ThrottlerModule` or global middleware; only module-specific limits (e.g. venue booking) | SECURITY_GUIDE notes module-level limits only |
| Global security headers (Helmet) | Not registered in `main.ts` | DEPLOYMENT_GUIDE recommends reverse-proxy headers |
| Keycloak SSO | `KeycloakAuthProvider` stub; falls back to local JWT | DEVELOPER_GUIDE lists `AUTH_PROVIDER=keycloak` as non-functional |
| `FeatureGuard` / `@RequiresFeature` | Guard defined but not wired to any module | ARCHITECTURE notes partial feature-flag infra |
| Dedicated `SearchBar` component | Uses `UniversalSearchOmnibar`, `SpotlightSearch`, `CommandMenu` instead | ARCHITECTURE documents actual component names |
| Dedicated `AuditTimeline` component | Dean uses `DeanApprovalTimeline`; exam/dean audit via paginated API pages | ARCHITECTURE references actual components |
| `src/services/` layer (frontend) | Does not exist; API in `src/lib/api/` | DEVELOPER_GUIDE documents lib/api pattern |
| nginx.conf in repository | Reverse proxy configured externally (Coolify) | DEPLOYMENT_GUIDE describes routing rules only |
| REST API versioning (`/v1/`) | Single unversioned API surface | API_REFERENCE documents current paths |

---

## Partially documented (scope limits)

| Topic | What exists | Documentation scope |
|-------|-------------|---------------------|
| **Full API surface** | 68 controllers, 500+ routes | API_REFERENCE covers pilot workspaces + shared auth; full inventory via grep |
| **All 94 entities** | TypeORM entities in `backend/src/entities/` | ARCHITECTURE ER diagram covers pilot subset; SYSTEM_MAP lists modules |
| **All 33 frontend portals** | 525 `page.tsx` files | ARCHITECTURE lists pilot + shell pattern; not every route |
| **Mobile app** | `falcon-mobile/` Expo project | Not in Phase C scope; only `.env.example` noted |
| **Legacy JS seed scripts** | `backend/seed*.js` | DEVELOPER_GUIDE points to official `npm run db:seed` path |
| **Insights controller RBAC** | `@Roles` without `@UseGuards` on one controller | Noted in backend exploration; fix tracked as code gap |

---

## Outdated documentation removed or superseded

| Previous state | Resolution |
|----------------|------------|
| TESTING_GUIDE "Phase A only" | Rewritten for Phases A + B + B.1 |
| TESTING_GUIDE "no workflow tests" | Removed; workflow tests documented |
| Placeholder frontend test dirs | Updated to reflect 24 Vitest files |

No placeholder "TBD" sections remain in Phase C deliverables.

---

## Suggested next documentation tasks

| Priority | Task | Trigger |
|----------|------|---------|
| High | OpenAPI spec from Nest decorators | Before external API consumers |
| High | Registrar module guide | Phase 2 launch |
| Medium | HR module API appendix | HR pilot expansion |
| Medium | Operations runbook (incidents) | Production SRE handoff |
| Low | Component Storybook | UI consistency initiative |
| Low | Database migration changelog auto-gen | From `schema_migrations` table |

---

*Generated as part of Phase C — July 2026.*
