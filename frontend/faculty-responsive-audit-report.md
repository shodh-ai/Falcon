# Faculty Portal Responsive Audit Report

Generated: 2026-08-11T11:07:36.235Z

## Viewports in scope

- 320px
- 375px
- 425px
- 768px
- 1024px
- 1280px
- 1440px
- 1920px

## Method

Static AST-free pattern scan of Faculty pages/components for overflow risks.
Browser pixel QA still required for charts/calendars at each viewport.

## Shell hardening applied

- `FacultyPageShell`: `min-w-0 overflow-x-hidden`
- `AppShell` main already `overflow-x-hidden`
- Faculty AI FAB/panel constrained for 320px
- Invigilation / Exam Cell swap UIs use scrollable tables and fluid dialogs

## Auto-fixes applied

- Shell / AI / schedule-classes / weekly-tests / invigilation dialogs hardened for 320–425px.
- Wide grading/timetable tables intentionally use `min-w-*` **inside** `overflow-x-auto` (expected pattern, not page-level horizontal scroll).

## Remaining static findings

Most `missing-min-w-0-on-flex` hits are heuristic false positives where `min-w-0` already exists on ancestors (`FacultyPageShell`, `AppShell`).

| Severity | File | Notes |
|---|---|---|
| medium | grading `min-w-[800px]` | Parent has `overflow-x-auto` — OK |
| medium | timetable `min-w-[780px]` | Parent has `overflow-x-auto` — OK |
| low | analytics / mentorship / AI / dashboard / primitives | Ancestor `min-w-0` / truncate scoped |

## Browser matrix (not fully automated)

Live pixel verification at every viewport for charts/calendars still needs a browser pass. Static + shell hardening closes the production blockers that caused page-level overflow.
