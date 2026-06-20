# Legacy ERP Parity — Smoke Data & QA

## Apply smoke data

Schema migration (if not already applied):

```bash
cd backend && npm run db:migrate
```

Smoke seed (idempotent — safe to re-run):

```bash
cd backend && npm run db:migrate -- --force 20260625180000_legacy_parity_smoke_data.sql
```

Or apply the file directly:

```bash
psql "$DATABASE_URL" -f backend/migrations/20260625180000_legacy_parity_smoke_data.sql
```

Verify manifest rows:

```sql
SELECT smoke_key, sample_record, notes FROM smoke_seed_manifest
WHERE smoke_key LIKE 'parity.%' ORDER BY smoke_key;
```

## Test accounts

| Email | Password | Use for |
|-------|----------|---------|
| `registrar@mygyanvihar.com` | `password123` | Publish announcements |
| `student1@mygyanvihar.com` | `password123` | Notice Board, birthday subject |
| `faculty1@mygyanvihar.com` | `password123` | Attendance, proxy proposer |
| `ellwil@mygyanvihar.com` | `password123` | Proxy substitute faculty |
| `hod@mygyanvihar.com` | `password123` | Proxy approval, syllabus lag, birthdays |
| `finance@mygyanvihar.com` | `password123` | Cheque clearing |

## Feature walkthrough

### 1. Global Notice Board
- **Admin:** `/admin-ops/announcements` — posts `SMOKE: Republic Day holiday` and `SMOKE: Exam form deadline`
- **Student:** `/student/dashboard` — Notice Board widget (same two items)
- **Mobile:** Home tab — Notice Board card
- **API:** `GET /api/admin-ops/announcements/feed` (any authenticated user, same list)

### 2. Proxy / alternate teaching
- **HOD:** `/hod/approvals/proxy` — pending request: faculty1 → ellwil for SMOKE101 (`date_of_proxy` = today + 3 days)
- Approve → ellwil can mark attendance for faculty1’s class on that date
- **Faculty leave flow:** `/faculty/hr` → apply leave → proxy proposal form appears after submit

### 3. Attendance — same as previous hour
- **Prereq:** Run smoke on a **Tuesday** (SMOKE101 slots are `day_of_week = 2`) for pre-seeded 10–11 AM attendance
- **Faculty:** `/faculty/attendance` → select 11:00–12:00 SMOKE101 slot → **Take Same Attendance as Previous**

### 4. Lesson plan lag
- **HOD:** `/hod/academics/syllabus-tracking` — SMOKE101 shows module **12 days behind plan**
- Command center syllabus panel shows `days_behind`

### 5. Cheque clearing
- **Finance:** `/finance/cheque-clearing`
- Pending: cheque `SMOKE-CHQ-88421`, ₹25,000, `PENDING_CLEARANCE`
- **Clear** → marks SUCCESS, updates linked demand paid amount
- **Cheque Returned** → ₹500 bounce penalty demand + admit card lock notification for student1

### 6. Master configuration
- **Super Admin:** `/super-admin/settings`
- Seeded: India, SMOKE-General caste, SMOKE-OBC category, rule `SMOKE-PRN-2026` template `[YEAR][DEPT][SEQ]`
- Test generate → e.g. `2026CSE001`

### 7. Today’s birthdays
- **HOD:** `/hod/dashboard` — widget lists **student1** (DOB set to today’s month/day in smoke seed)

### 8. Lecture suspension
- **Faculty:** `/faculty/timetable` — submit or view pending `SUSPENSION` adjustment (SMOKE lab maintenance)
- **HOD:** `/hod/inbox` or extra-class approvals flow

## Automated tests

```bash
cd backend && npm test -- --testPathPattern="announcements.service.spec|finance-cheque.service.spec"
```

## API smoke (with valid JWT)

```bash
# Replace TOKEN and BASE
export BASE=http://localhost:3001
export TOKEN=<jwt>

curl -s "$BASE/api/admin-ops/announcements/feed" -H "Authorization: Bearer $TOKEN" | jq length
curl -s "$BASE/api/master-data/birthdays/today" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/finance/cheques/pending" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/api/academics/hod/approvals/proxy-requests" -H "Authorization: Bearer $TOKEN" | jq
```

Expected after seed: feed ≥ 2, birthdays ≥ 1 (student1), cheques ≥ 1 pending, proxy ≥ 1 pending (HOD token).
