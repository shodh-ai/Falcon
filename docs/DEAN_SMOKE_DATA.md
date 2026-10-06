# Dean smoke data

The local Dean smoke dataset is additive and isolated. It does not delete or update existing faculty, student, department, or workflow records.

## Seed

Run from `backend/` with an explicit local/QA opt-in:

```bash
DEAN_SMOKE_SEED=true \
DB_HOST=localhost DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres \
DB_DATABASE=university_governance \
npm run db:seed:dean-smoke
```

Login:

```text
Email: dean.smoke@mygyanvihar.com
Password: password123
```

The seed creates the `DEAN-SMOKE` school, one department, one HOD, one faculty account, four students, two courses, timetable slots, syllabus modules, and isolated records for:

- dashboard, departments, student monitor, faculty workload, timetable, syllabus and result analytics;
- Dean inbox, grievance/helpdesk, safety concern and notifications;
- research project/publication, department and program budgets;
- Ph.D. candidate awaiting Dean review, project funding request and attendance-threshold request;
- exam result approval, campus event awaiting approval and a scheduled meeting;
- HR self-service entity, one published September 2026 payslip and one mandatory policy;
- audit log and global search.

The smoke Dean is scoped only to the `DEAN-SMOKE` school. The data is deliberately representative: placement and some executive analytics can still show zero metrics where the underlying module has no smoke fixture or uses shared historical aggregates. The seed does not modify existing faculty, student, department, or workflow records.

## Cleanup

Cleanup is guarded and removes only the fixed smoke IDs, email, school code, department name, and course codes:

```bash
DEAN_SMOKE_CLEAN=true \
DB_HOST=localhost DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres \
DB_DATABASE=university_governance \
npm run db:clean:dean-smoke
```

Both commands refuse to run when the deployment environment is production.
