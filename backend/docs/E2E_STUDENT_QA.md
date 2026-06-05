# E2E Student QA — Seed & Quest Checklist

## Prerequisites

Apply migrations through at least:

- `20260602180000_finance_workspace_complete.sql` (creates **`finance_fee_demands`**, not `fin_fee_demands`)
- `20260602200000_falcon_notifications.sql`
- `20260608160000_mentorship_chats_ephemeral.sql`

Then run the idempotent seed:

```bash
# from repo root, adjust for your migration runner
psql "$DATABASE_URL" -f backend/migrations/20260609120000_e2e_student_qa_seed.sql
```

## Test accounts

| Email | Password | Mentor |
|-------|----------|--------|
| `e2e.student1@mygyanvihar.com` … `e2e.student5@mygyanvihar.com` | `password123` | `faculty1@mygyanvihar.com` |

## Common seed errors (fixed in `20260609120000`)

### 1. Mentorship — `column "status" does not exist`

`academic_mentorships` uses `is_active` (default `true`), not `status`:

```sql
INSERT INTO academic_mentorships (student_user_id, proctor_user_id)
SELECT u.user_id, faculty.user_id
FROM users u
CROSS JOIN (SELECT user_id FROM users WHERE official_email = 'faculty1@mygyanvihar.com' LIMIT 1) faculty
WHERE u.official_email LIKE 'e2e.student%@mygyanvihar.com'
ON CONFLICT (student_user_id) DO NOTHING;
```

### 2. Finance — `relation "fin_fee_demands" does not exist`

The real table is **`finance_fee_demands`**. If you see this error, finance migrations have not been applied yet. Run migrations, then re-seed or insert manually:

```sql
INSERT INTO finance_fee_demands (tenant_id, student_user_id, fee_head, academic_year, semester, total_amount, due_date, status)
SELECT u.tenant_id, u.user_id, 'TUITION', '2025-26', 5, 85000, CURRENT_DATE + 30, 'PENDING'
FROM users u WHERE u.official_email LIKE 'e2e.student%@mygyanvihar.com';
```

### 3. Notifications — `null value in column "tenant_id"`

Falcon is multi-tenant; always copy `tenant_id` from the user row:

```sql
INSERT INTO falcon_notifications (tenant_id, user_id, category, title, message, action_link)
SELECT u.tenant_id, u.user_id, 'ACADEMICS', 'Welcome to Falcon OS',
       'Please complete your profile and upload your documents.', '/student/profile'
FROM users u WHERE u.official_email LIKE 'e2e.student%@mygyanvihar.com';
```

## Quest 3 — Mentorship chat routing

1. Login as `e2e.student4@mygyanvihar.com` / `password123`.
2. Open **Mentorship** → send a message in **Chat with mentor**.
3. Login as `faculty1@mygyanvihar.com` / `password123`.
4. Open **Mentorship & Approvals** → **Mentorship Chat** messenger → select the E2E student → message should appear.

API surface:

- Student: `GET/POST /api/academics/proctor/chat/my`, `POST /api/academics/proctor/chat`
- Faculty: `GET /api/academics/proctor/chat/mentees`, `GET /api/academics/proctor/chat/thread/:studentUserId`

Chats are ephemeral (7-day retention per `mentorship_chats` migration).

## What works without finance tables

- Login and profile
- Mentorship meetings, leave requests, and chat (with mentorship + chat migrations)
- Helpdesk, library, events (module-dependent)

Admit-card lock / fee-payment loops require `finance_fee_demands` to exist.
