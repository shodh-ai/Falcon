# DoFA Master Test Plan — Simplified Tester Edition

## 1. Purpose

Use this document for day-to-day testing of Modules 1–9 and Module X. The detailed QA plan remains the authority for security, audit evidence, performance and release sign-off.

Test the platform in this order:

```text
Module 1 → Module 2 → Module 3 → Module 4 → Module 5
                                      ↓
                                  Module X
                                      ↓
                      Modules 6, 7, 8 and 9
```

## 2. Simple test rules

Every important test must prove:

1. The correct user can perform the action.
2. A user from another department or tenant cannot access it.
3. The creator cannot perform the protected approval/checking step.
4. Repeating the same request does not create a duplicate.
5. Two simultaneous actions cannot overspend funds or quantities.
6. Finalized records cannot be edited or deleted.
7. The audit trail, event and downstream result are correct.

For critical cases, save:

- UI or API result;
- relevant database rows;
- audit record;
- event/outbox record;
- final financial or quantity reconciliation.

## 3. Test accounts

The full account registry is in Sections 6.6–6.9 of the [detailed QA plan](/Users/apple/Documents/L&T/Falcon/docs/DOFA_MASTER_TESTING_QA_PLAN_V2.md:345).

### Password convention

```text
P01 → DofaQA!P01#2026
P02 → DofaQA!P02#2026
...
P42 → DofaQA!P42#2026

C01 → DofaQA!C01#2026
...
C15 → DofaQA!C15#2026
```

P43 uses OAuth, P44 uses an mTLS device certificate and P45 is anonymous.

### Main persona lookup

| ID | User |
|---|---|
| P01 | Acquisition requester |
| P03 | Procurement buyer |
| P04 | Procurement head |
| P05 | Budget officer |
| P06 | Invoice entrant |
| P07 | Invoice verifier |
| P08 | Payment poster |
| P09–P11 | DoFA approvers |
| P12 | Receiving clerk |
| P13 | Stores operator |
| P14 | Physical capturer |
| P15 | Physical reviewer |
| P16 | Physical exception approver |
| P17 | Inventory identity preparer |
| P18 | RFID encoder |
| P19 | RFID attachment verifier |
| P20 | Gate security operator |
| P21 | Consumables requester |
| P22 | Stock approver |
| P23 | Stock issuer |
| P24 | Stock counter |
| P25 | Count approver |
| P26 | Return initiator |
| P27 | Return eligibility reviewer |
| P28 | Return approver |
| P29 | Service reporter |
| P30 | Service technician |
| P31 | Service acceptor |
| P32 | Retirement requester |
| P33 | Retirement assessor |
| P34 | Sanitization operator |
| P35 | Sanitization verifier |
| P36 | Bid administrator |
| P37 | Disposal award approver |
| P38 | Disposal executor/witness |
| P39 | Internal auditor |
| P40 | Tenant administrator |
| P41 | Super administrator |
| P42 | External service provider |
| P43 | IRMS service identity |
| P44 | Module X device identity |
| P45 | Anonymous scanner |

Use C01–C15 for tests where one account deliberately has both roles. The second protected action must still be rejected.

## 4. Module checklists

### Module 1 — Acquisition

- Create and edit a multi-line draft as P01.
- Validate required date, priority, costs and special requirements.
- Submit and prove the submitted version is immutable.
- Test vendor scoring and a non-recommended-vendor exception.
- Reserve budget concurrently and prove no overspending.
- Approve through distinct DoFA users P09–P11.
- Reject self-approval and wrong-department approval.
- Test Excel preview, errors and atomic commit.
- Verify one complete `AcquisitionApproved.v1` event.

### Module 2 — Procurement and funds

- Create the procurement case from the approved acquisition.
- Test split orders, partial receipts and cancelled quantities.
- Enter an invoice as P06 and verify it as P07.
- Test vendor, currency, quantity, price, tax and freight matching.
- Verify the allocation invariant:

```text
Approved = Available + Committed + Net Expended + Released
```

- Test partial payments, credits and refunds.
- Reject payment without current match, integrity clearance or funds.
- Confirm legacy records are projections and cannot overwrite Module 2.

### Module 3 — Invoice integrity

- Test exact authoritative-source matching.
- Test offline, personal-account and unavailable-source invoices.
- Confirm unavailable evidence reduces coverage/confidence instead of risk.
- Confirm blockers override a low risk score.
- Use distinct investigator and certifier identities.
- Replace the invoice document and confirm the old clearance becomes stale.
- Confirm AI failure routes to deterministic processing or human review.
- Confirm payment uses the exact current invoice revision and hash.

### Module 4 — Physical verification

- Create one ITEM per accepted asset and exact quantities for LOTs.
- Test live capture, nonce, required views and replay rejection.
- Test geofence boundary and poor GPS accuracy.
- Preserve `MATCHED`, `MISMATCHED`, `UNKNOWN` and `NOT_APPLICABLE`.
- Confirm automated clearance meets every policy condition.
- Reject material substitution as an exception.
- Use different users for capture and review.
- Revoke a verification identity and confirm its scan status changes.

### Module 5 — Inventory

- Allocate a unique Asset ID to every ITEM and Lot ID to every LOT.
- Reject duplicate Asset IDs, RFID IDs, tag bindings and required manufacturer serials.
- Test atomic two-sided LOT transfers.
- Keep ownership, custody and location histories separate.
- Quarantine inventory after Module 4 revocation.
- Confirm identity corrections preserve permanent IDs unless formally proven wrong.
- Confirm public scans hide serial, custodian, location and price.

### Module X — RFID, labels and gates

- Execute only a signed Module 5 provisioning job.
- Reject operator-supplied Asset/RFID IDs, expired jobs and replayed jobs.
- Use different users for encoding and attachment verification.
- Test spoiled label, failed encoding and tag replacement history.
- Test valid, missing, expired and wrong-gate movement permits.
- Missing permits must produce `REVIEW_REQUIRED`, not a theft determination.
- Test device certificate, sequence and offline-cache controls.

### Module 6 — Consumables

- Approve requests using exact FEFO/FIFO LOT allocations.
- Test concurrent reservations and automatic reservation expiry.
- Test partial issue, consumption and unused-stock return.
- Confirm issue and consumption do not subtract stock twice.
- Prevent expired or quarantined LOT reservation/issue.
- Test blind counts with a different approver.
- Confirm replenishment creates only a Module 1 draft.

### Module 7 — Return/DOA

- Allocate the exact ITEM or exact partial LOT quantity.
- Prevent a second active ITEM case or LOT oversubscription.
- Place a hold without reducing stock before shipment.
- Test DOA and standard-return evidence separately.
- Test rejection/cancellation hold release.
- Confirm a replacement gets new identities.
- Confirm a repaired original retains its Asset ID but is reverified.
- Reject Module 2 execution using a superseded decision.
- Confirm only Module 2-posted recovery changes financial state.

### Module 8 — Service and warranty

- Place a service hold and prevent conflicting operations.
- Allow only one active service execution per asset.
- Test warranty precedence and expiry.
- Prevent paid work before Modules 1–2 authorization.
- Route parts through Modules 4–6 as applicable.
- Require Module 4 reverification after a material repair.
- Use different technician/provider and final acceptor identities.
- Keep irreparable/unsafe assets quarantined and refer them to Module 9.

### Module 9 — Retirement and disposal

- Place a retirement hold and test Module 5/7/8/legacy bypass attempts.
- Complete technical, Finance, legal, environmental and data assessment.
- Test the pinned `ASSET_WRITEOFF` DoFA route.
- Use different sanitization operator and verifier identities.
- Test sealed offers, conflicts and below-reserve amendment.
- Test partial pickup using the exact asset manifest.
- Test physical completion while Finance is pending or failed.
- Do not close the case or issue a certificate until all gates pass.
- Confirm disposed Asset/RFID identities are never reused.

## 5. Full lifecycle tests

Run these journeys after the module checklists pass:

| Journey | Required result |
|---|---|
| Asset purchase | Request → approval → order → receipt → invoice → verification → inventory → RFID |
| Consumable purchase | Acquisition → LOT inventory → reservation → issue → consumption/return |
| DOA replacement | Exact return → replacement receipt → new subject → new inventory identity/tag |
| Repaired original | Repair → reverification → same Asset ID → return to service |
| External service | Valid movement permit authorizes only the correct asset/gate/window |
| Retirement | Referral → assessment → DoFA → sanitization → disposal → Finance → certificate |
| Cross-tenant attack | No read, write, metadata, URL, event or timing leak |
| Revocation propagation | Stale invoice/verification/decision/permit blocks downstream work |

For every journey, deliberately attempt one action using the wrong persona.

## 6. Concurrency and retry checks

Run parallel tests for:

- budget reservations;
- order quantities;
- payments and refunds;
- receipts;
- physical subjects;
- Asset/Lot/RFID identifiers;
- LOT transfers and consumable reservations;
- return holds;
- service and retirement cases;
- RFID job claims and tag bindings;
- DoFA decisions.

Expected result: exactly one valid effect, no negative balance, no duplicate identity and no duplicate event.

Repeat every external mutation with:

1. the same idempotency key and same payload—return the original result;
2. the same key and changed payload—return `409`;
3. an old `If-Match` revision—return `409` with current revision.

## 7. Security checks

- Test every object ID using Tenant B and the wrong department/location account.
- Test disabled, expired-grant, role-without-grant and wrong-scope accounts.
- Test malicious spreadsheet formulas, macros and links.
- Test malicious PDF/image uploads and oversized files.
- Test event, evidence, payload and signature tampering.
- Test OAuth audience/scope misuse and mTLS certificate mismatch.
- Confirm public scans and error messages do not reveal sensitive data.
- Confirm AI cannot approve, reject, pay, allocate identity or classify fraud.

Any cross-tenant access, payment/approval bypass, quantity corruption or identity reuse blocks release.

## 8. Pass/fail record

Use this compact template:

```text
Test ID:
Build/environment:
Persona/login ID:
Tenant/scope:
Preconditions:
Steps:
Expected result:
Actual result:
API/DB/audit/event evidence:
Pass / Fail / Blocked:
Defect ID:
Tester/date:
```

## 9. Final release gate

Release only when:

- all critical and high-risk tests pass;
- all persona allow/deny and maker-checker tests pass;
- financial and quantity totals reconcile to zero difference;
- concurrency, retry and event recovery pass;
- no cross-scope access succeeds;
- legacy write bypass is blocked;
- hardware and gate tests pass for the selected pilot;
- performance, security and UAT sign-offs are complete;
- no critical or high-severity defect remains open.

The detailed QA plan must be used whenever this simplified checklist does not specify enough evidence or edge-case detail.
