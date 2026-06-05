# Falcon Events Engine — QA

## Prerequisites

- Migrations `20260603160000_falcon_events_engine.sql` and `20260603170000_falcon_events_lifecycle.sql` applied
- Redis running (paid checkout locks)
- Backend on `:4000`, frontend on `:3000`

## End-to-end lifecycle

| Phase | Portal | Action |
|-------|--------|--------|
| 1 Master calendar | `/admin-ops/calendar` | Registrar/Dean block exam/holiday dates |
| 2 Propose | `/student/club-management` | Coordinator proposes (blocked dates rejected) |
| 3 Tier 1 | `/faculty/event-approvals` | Faculty advisor approves content |
| 3 Tier 2 | `/admin-ops/events` | Estate approves venue (clash warning) |
| 3 Tier 3 | `/finance/events` | Finance approves paid-event ledger → **LIVE** |
| 4 Register | `/student/events` | Students register (Redis checkout if paid) |
| 5 Scan | Club Management → Scanner | Coordinator scans QR → SODECA IQAC credit |

## Test personas

| Role | Email | Notes |
|------|-------|--------|
| Student / coordinator | `student1@mygyanvihar.com` | Robotics Club coordinator |
| Faculty advisor | `faculty1@mygyanvihar.com` | Approves Robotics proposals |
| Student (register) | any active student | e.g. second student if seeded |

Password: `password123` (local dev)

## Seeded data

- **Robotics Club** — coordinator `student1`, advisor `faculty1`
- **Intro to ROS Workshop** — free, APPROVED, 50 slots
- **Falcon DJ Night** — paid ₹500, APPROVED, 100 slots

## Flows

### 1. Faculty approval

1. Login as `student1` → `/student/club-management` (nav appears only for coordinators).
2. Propose a test event → status `PENDING_APPROVAL`.
3. Login as `faculty1` → `/faculty/event-approvals` → Approve.
4. Verify notification inbox for faculty on propose (OPERATIONS category).

### 2. Free registration (atomic capacity)

1. Login as a student → `/student/events` → Discover.
2. Register for **Intro to ROS Workshop**.
3. Expect instant ticket with `FALCON-EVT-…` QR on **My Tickets**.
4. Repeat with another student until full → expect **Event is full.**

### 3. Paid registration (180s hold)

1. Register for **Falcon DJ Night** → redirect to checkout with **03:00** countdown.
2. Complete mock Razorpay → ticket on My Tickets.
3. Let timer expire without pay → hold released, `pending_holds` decremented, status `EXPIRED`.
4. Two students starting checkout on last slot: second should get conflict or full.

### 4. Finance webhook

```bash
curl -X POST http://localhost:4000/api/finance/webhook/razorpay \
  -H "Content-Type: application/json" \
  -d '{
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_evt_test_001",
          "order_id": "order_test",
          "amount": 50000,
          "notes": {
            "fee_head": "EVENTS_CLUB",
            "registration_id": "<REGISTRATION_UUID>",
            "event_id": "<EVENT_UUID>",
            "student_user_id": "<STUDENT_UUID>",
            "tenant_id": "a0000000-0000-4000-8000-000000000001"
          }
        }
      }
    }
  }'
```

Expect `event_registration: true` and registration `PAID` with slot decremented.

### 5. Coordinator CSV

1. As `student1`, open Club Management → download CSV for an APPROVED event.
2. CSV lists name, email, status, qr_code, registered_at.

## API surface

- `GET /api/campus-events/events`
- `POST /api/campus-events/events/:id/register`
- `POST /api/campus-events/events/:id/register/confirm`
- `GET /api/campus-events/my-tickets`
- `GET /api/campus-events/me/club-coordinator`
- Coordinator + faculty routes per `campus-events.controller.ts`
