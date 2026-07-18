# President Navigation Audit

**Phase F.1** · Routes, entry/exit, dead pages, duplicates

---

## Sidebar Inventory (13 + Settings)

| # | Label | Route | Entry | Exit | Status |
|---|-------|-------|-------|------|--------|
| 1 | Executive Summary | `/president/executive-summary` | Login default | Any nav item | ✅ Home |
| 2 | Academics | `/president/academics` | Sidebar | Sidebar | ✅ |
| 3 | Result Insights | `/president/insights` | Sidebar | Sidebar | ✅ |
| 4 | Finance | `/president/finance` | Sidebar | Sidebar | ✅ |
| 5 | Finance & Budgetary Control | `/president/finance-budget` | Sidebar | Sidebar | ⚠️ Overlaps Finance |
| 6 | Research & Extension Hub | `/president/research` | Sidebar | Sidebar | ✅ |
| 7 | Compliance | `/president/compliance` | Sidebar | Sidebar | ✅ |
| 8 | HR Analytics | `/president/hr-analytics` | Sidebar | Sidebar | ⚠️ Adjacent to HR Approvals |
| 9 | HR Approvals | `/president/hr-approvals` | Sidebar | Sidebar | ❌ Dead action page |
| 10 | Grievances Escalation | `/president/issues` | Sidebar | Sidebar | ❌ API 403 |
| 11 | Executive Orders | `/president/executive-orders` | Sidebar | Sidebar | ❌ Empty data |
| 12 | Convocation | `/president/convocation` | Sidebar | Sidebar | ⚠️ Monitor only |
| 13 | Meetings | `/president/meetings` | Sidebar | Sidebar | ✅ |
| 14 | Account Settings | `/president/settings` | Auto-injected nav | Sidebar | ✅ |

---

## Hidden / Orphan Routes

| Route | Issue | Priority |
|-------|-------|----------|
| `/president/dashboard` | Alias re-export of executive-summary — duplicate entry | P3 |
| `/president/[...slug]` | Catch-all → dashboard — masks 404s | P2 |
| `/leadership/*` | President RBAC allows frontend access but **all APIs 403** | P0 |
| `/finance/*` | President can access per auth-routing but **not in President nav** | P1 |
| `/reports` | President role allowed — **not in President nav** | P2 |
| `/hr/*` | President role allowed — **not in President nav** | P2 |

---

## Command Palette Gaps

| In sidebar | In command palette |
|------------|-------------------|
| Result Insights ✅ | **Missing** ❌ |
| All others | Present ✅ |

**Impact (P2):** President cannot quick-jump to Insights via ⌘K.

---

## Quick Actions

| Page | Quick action | Works? |
|------|--------------|--------|
| Workspace pages | Search/filter table | ✅ Client-side only |
| Workspace pages | Export/download | ⚠️ Not configured on presidentPages |
| Issues | Escalate button | ❌ API fails |
| Issues | Export PDF | ⚠️ DOM export only |
| Meetings | Schedule / Request | ✅ |
| Insights | None | — |

President workspace configs (`presidentPages`) define **no `action` field** — unlike some admin pages with bulk actions.

---

## Broken Links

| Link / flow | Problem |
|-------------|---------|
| Grievances → Escalate HOD | 403 Forbidden |
| HR Approvals → Approve | No button / empty data |
| Executive Summary pending verifications | No link to Registrar queue |
| Executive Summary pending governance | No link to Compliance task detail |
| Finance pending approvals KPI | No link to finance OTP approval |
| Convocation pending verifications | No link to Registrar cert queue |

---

## Duplicated Functionality

| Area | Duplication | Recommendation |
|------|-------------|----------------|
| Finance vs Finance & Budget | Both show financial health | Keep both — different granularity (P3) |
| President Compliance vs IQAC portal | Task defaulting view | President view is read-only subset — OK |
| President vs Leadership overview | Leadership blocked for President | President Executive Summary is substitute — OK if Leadership intentionally Chairman-only |

---

## Workspace Switcher

President can switch to other workspaces per `available-workspaces.ts` if role permits. **Risk (P2):** President may land in `/leadership/overview` via switcher and see broken/empty state due to OwnerAccessGuard.

---

## Notification Entry Points

President receives notifications in global inbox (if configured). **Not verified:** clicking notification deep-links to President convocation/meetings. Meetings supports `?meeting=` query param ✅.

---

## Navigation Score: **72 / 100**

| Criterion | Score |
|-----------|-------|
| All menu items resolve | 95 |
| Logical grouping | 85 |
| Actionable exits | 45 |
| No dead ends | 50 |
| Command palette completeness | 80 |
| Cross-portal discoverability | 60 |

---

*Phase F.1 — President Navigation Audit*
