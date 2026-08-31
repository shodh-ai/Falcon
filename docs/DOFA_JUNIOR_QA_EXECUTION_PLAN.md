# DoFA Modules 1–9 + Module X — Guided End-to-End Test Script

**Purpose:** A junior tester follows this document from top to bottom.  
**Method:** Log in as one named user, perform that user's work, log out, and continue as the next user.  
**Environment:** QA/UAT or production-like staging only. Never run these test transactions in the real production database.

---

## 1. The complete journey

The tester will raise one Physics Lab acquisition containing:

1. Three Dell Latitude 5450 laptops.
2. One hundred boxes of nitrile gloves.
3. One laptop installation service.

The same records will pass through every module:

```text
M1 Raise and approve acquisition
  ↓
M2 Order, receive, invoice, match and pay
  ↓
M3 Verify invoice integrity
  ↓
M4 Verify laptops and glove lot physically
  ↓
M5 Create permanent Asset IDs and Lot ID
  ↓
MX Encode/attach RFID and test gate passage
  ↓
M6 Reserve, issue, consume and return gloves
  ↓
M7 Return one DOA laptop and receive replacement
  ↓
M8 Repair another laptop and mark it irreparable
  ↓
M9 Retire, sanitize, dispose and close that laptop
```

At the end, the tester must show the complete provenance from acquisition to final lifecycle outcome.

---

## 2. Before starting

### 2.1 Safety check

Ask the QA lead to confirm:

- [ ] The URL is QA/UAT or production-like staging.
- [ ] The database is an approved test database.
- [ ] Test accounts are seeded.
- [ ] Modules 1–9 and X flags are enabled for Tenant A.
- [ ] Test signing keys, workers, object storage, and sandbox integrations are available.

If any answer is unknown, stop. Do not substitute production accounts or a super-admin.

### 2.2 Fill in the environment

```text
Frontend URL: ______________________________________
Backend URL: _______________________________________
Environment: _______________________________________
Build/commit: ______________________________________
Test date: _________________________________________
Tester: ____________________________________________
```

Implemented workspace paths:

```text
/finance/acquisitions
/finance/procurements
/finance/invoice-integrity
/finance/product-verification
/finance/inventory
/finance/physical-identity
/finance/consumables
/finance/returns
/finance/asset-service
/finance/asset-retirement
```

### 2.3 Test accounts

These are disposable QA fixtures, never production credentials.

Seed them in a non-production database before first use:

```bash
cd backend
NODE_ENV=test DOFA_QA_SEED_ENABLED=true npm run db:seed:dofa-qa
```

Normal migrations deliberately do not create known-password accounts. The guarded seed refuses production environments.

| ID | Role | Login | Password |
|---|---|---|---|
| P01 | Acquisition requester | `qa.dofa.p01.requester.a@mygyanvihar.test` | `DofaQA!P01#2026` |
| P02 | Other-department requester | `qa.dofa.p02.requester.b@mygyanvihar.test` | `DofaQA!P02#2026` |
| P03 | Procurement buyer | `qa.dofa.p03.buyer@mygyanvihar.test` | `DofaQA!P03#2026` |
| P04 | Procurement head | `qa.dofa.p04.procurement-head@mygyanvihar.test` | `DofaQA!P04#2026` |
| P05 | Budget officer | `qa.dofa.p05.budget@mygyanvihar.test` | `DofaQA!P05#2026` |
| P06 | Invoice entrant | `qa.dofa.p06.invoice-entry@mygyanvihar.test` | `DofaQA!P06#2026` |
| P07 | Invoice verifier | `qa.dofa.p07.invoice-verify@mygyanvihar.test` | `DofaQA!P07#2026` |
| P08 | Payment poster | `qa.dofa.p08.payment@mygyanvihar.test` | `DofaQA!P08#2026` |
| P09 | DoFA L1 | `qa.dofa.p09.hod-a1@mygyanvihar.test` | `DofaQA!P09#2026` |
| P10 | DoFA L2 | `qa.dofa.p10.dean-a@mygyanvihar.test` | `DofaQA!P10#2026` |
| P11 | Executive DoFA | `qa.dofa.p11.executive@mygyanvihar.test` | `DofaQA!P11#2026` |
| P12 | Receiving clerk | `qa.dofa.p12.receiving@mygyanvihar.test` | `DofaQA!P12#2026` |
| P13 | Stores operator | `qa.dofa.p13.stores@mygyanvihar.test` | `DofaQA!P13#2026` |
| P14 | Physical capturer | `qa.dofa.p14.capturer@mygyanvihar.test` | `DofaQA!P14#2026` |
| P15 | Physical reviewer | `qa.dofa.p15.physical-review@mygyanvihar.test` | `DofaQA!P15#2026` |
| P16 | Physical exception approver | `qa.dofa.p16.physical-exception@mygyanvihar.test` | `DofaQA!P16#2026` |
| P17 | Inventory identity preparer | `qa.dofa.p17.identity-prepare@mygyanvihar.test` | `DofaQA!P17#2026` |
| P18 | RFID/label encoder | `qa.dofa.p18.rfid-encode@mygyanvihar.test` | `DofaQA!P18#2026` |
| P19 | RFID attachment verifier | `qa.dofa.p19.rfid-verify@mygyanvihar.test` | `DofaQA!P19#2026` |
| P20 | Gate security | `qa.dofa.p20.gate-security@mygyanvihar.test` | `DofaQA!P20#2026` |
| P21 | Consumables requester | `qa.dofa.p21.stock-request@mygyanvihar.test` | `DofaQA!P21#2026` |
| P22 | Consumables approver | `qa.dofa.p22.stock-approve@mygyanvihar.test` | `DofaQA!P22#2026` |
| P23 | Consumables issuer | `qa.dofa.p23.stock-issue@mygyanvihar.test` | `DofaQA!P23#2026` |
| P24 | Blind counter | `qa.dofa.p24.stock-count@mygyanvihar.test` | `DofaQA!P24#2026` |
| P25 | Count approver | `qa.dofa.p25.count-approve@mygyanvihar.test` | `DofaQA!P25#2026` |
| P26 | Return initiator | `qa.dofa.p26.return-initiate@mygyanvihar.test` | `DofaQA!P26#2026` |
| P27 | Return eligibility reviewer | `qa.dofa.p27.return-eligibility@mygyanvihar.test` | `DofaQA!P27#2026` |
| P28 | Return approver | `qa.dofa.p28.return-approve@mygyanvihar.test` | `DofaQA!P28#2026` |
| P29 | Service reporter | `qa.dofa.p29.service-report@mygyanvihar.test` | `DofaQA!P29#2026` |
| P30 | Service technician | `qa.dofa.p30.technician@mygyanvihar.test` | `DofaQA!P30#2026` |
| P31 | Service acceptor | `qa.dofa.p31.service-accept@mygyanvihar.test` | `DofaQA!P31#2026` |
| P32 | Retirement requester | `qa.dofa.p32.retirement-request@mygyanvihar.test` | `DofaQA!P32#2026` |
| P33 | Retirement assessor | `qa.dofa.p33.retirement-assess@mygyanvihar.test` | `DofaQA!P33#2026` |
| P34 | Sanitization operator | `qa.dofa.p34.sanitize@mygyanvihar.test` | `DofaQA!P34#2026` |
| P35 | Sanitization verifier | `qa.dofa.p35.sanitize-verify@mygyanvihar.test` | `DofaQA!P35#2026` |
| P36 | Bid administrator | `qa.dofa.p36.bid-admin@mygyanvihar.test` | `DofaQA!P36#2026` |
| P37 | Award approver | `qa.dofa.p37.disposal-award@mygyanvihar.test` | `DofaQA!P37#2026` |
| P38 | Disposal executor | `qa.dofa.p38.disposal-execute@mygyanvihar.test` | `DofaQA!P38#2026` |
| P39 | Internal auditor | `qa.dofa.p39.auditor@mygyanvihar.test` | `DofaQA!P39#2026` |

Wrong-tenant account:

```text
qa.dofa.requester@tenant-b.test / DofaQA!TB01#2026
```

First, log in as P01, P03, P06, P12, P14, P17, P21, P26, P29, and P32. Confirm each account's tenant, department, role, and landing page. If an account is missing, mark **BLOCKED – account not seeded**.

---

## 3. Record every generated ID

```text
Acquisition ID/number/version: _____________________
Acquisition snapshot hash: _________________________
Budget reservation ID: _____________________________
DoFA case ID: ______________________________________
Procurement case ID: _______________________________
Laptop/glove/service order IDs: ____________________
Laptop/glove receipt line IDs: _____________________
Invoice IDs/revisions/hashes: ______________________
Integrity case IDs: ________________________________
Laptop subject IDs 1/2/3: __________________________
Glove lot subject ID: ______________________________
Laptop Asset IDs 1/2/3: ____________________________
Laptop inventory UUIDs: ____________________________
Glove Lot ID/inventory UUID: _______________________
Logical RFID IDs/tag UIDs: _________________________
Consumables request/reservation: ___________________
Return case/replacement Asset ID: __________________
Service case: ______________________________________
Retirement case/certificate: _______________________
```

---

## 4. Fixed purchase data

### Header

```text
Title: Physics Lab Computing and Safety Supplies – QA
Department/lab: Physics / Dept A1 / Physics Lab A1
Use: Student experiments, data acquisition and safety
Required by: 30 days from test date
Priority: NORMAL
Funding: QA Physics Equipment Fund
Special requirement: Sealed delivery; installation by certified technician
Remarks: Full Modules 1–9 + X QA journey
Currency: INR
```

### Lines

| Line | Classification | Product | Qty | Unit | Unit price |
|---|---|---|---:|---|---:|
| L1 | ASSET | Dell Latitude 5450, 16 GB RAM, 512 GB SSD | 3 | EACH | ₹80,000 |
| L2 | CONSUMABLE | Nitrile laboratory gloves | 100 | BOX | ₹10 |
| L3 | INSTALLATION | Laptop configuration/installation | 1 | SERVICE | ₹5,000 |

Use ₹2,000 delivery and the server's published QA tax policy. Record the server total; never force a client-calculated total.

Vendors:

```text
Vendor A: QA Empanelled Technology Supplier (recommended)
Vendor B: QA Alternate Supplier (exception test)
Vendor C: QA Ineligible Supplier (hard-gate test)
```

---

# PART A — ACQUIRE AND PAY

## 5. Module 1 — Raise and approve acquisition

### M1.1 Requester creates draft

**Login:** P01. **Open:** `/finance/acquisitions`.

1. Create a new acquisition using Section 4.
2. Add all three lines and save.
3. Record acquisition/version IDs.
4. Refresh and reopen it.

Expected: `DRAFT`, three lines retained, server totals shown, revision increases after edit.

### M1.2 Validate fields

1. Remove required-by date; validate. Expect a field error.
2. Set laptop quantity to zero; validate. Expect a line error.
3. Enter an invalid URL; validate. Expect a URL error.
4. Restore correct values and validate.

Expected: invalid data never advances; corrected version becomes `VALIDATED`.

### M1.3 Submit and test immutability

1. Submit the version.
2. Record snapshot hash.
3. Try to edit model or price.

Expected: mutation blocked; amendment offered; snapshot unchanged.

### M1.4 Test wrong department

Log out, log in as P02, search acquisition number, then paste its detail URL.

Expected: safe denial/404 with no requester, amount, or hash leakage. Log out.

### M1.5 Vendor review

**Login:** P03.

1. Open the acquisition vendor review.
2. Generate/inspect recommendations.
3. Confirm Vendor A is recommended and scoring policy/version/calculation is visible.
4. Try Vendor C. Expect hard eligibility rejection.
5. Try Vendor B without justification. Expect rejection.
6. Enter `QA exception test` and select Vendor B. Confirm exception flag/audit.
7. Return main journey selection to Vendor A if workflow permits.

### M1.6 Budget reservation

**Login:** P05.

1. Open the acquisition.
2. Confirm requested amount equals server total.
3. reserve budget and record reservation ID/expiry.

Expected: `BUDGET_RESERVED`, exact version link, immutable amount.

### M1.7 DoFA approvals

1. Login P09, approve L1 with `QA L1 approval`, record decision ID/hash, logout.
2. Login P10, approve L2 with `QA L2 approval`, logout.
3. Login P11, give final approval with `QA final approval`.

Expected: `APPROVED`; distinct, append-only hash-linked decisions; pinned route; one complete `AcquisitionApproved.v1`.

**Checkpoint:** Do not continue until acquisition, budget, route, decisions, snapshot and approved event all agree.

---

## 6. Module 2 — Order, receive, invoice, match and pay

### M2.1 Procurement case

**Login:** P03. **Open:** `/finance/procurements`.

Search acquisition number. Record procurement case ID. Confirm exactly one case and matching acquisition version/hash/reservation.

### M2.2 Orders

Create and issue:

```text
Order 1: Vendor A, 3 laptops
Order 2: Vendor A, 100 glove boxes
Order 3: Vendor A, installation service
```

Expected: funds move Available → Committed once; quantity/currency/vendor stay inside Module 1 envelope. Try one extra laptop; expect rejection.

### M2.3 Goods receipt

**Login:** P12.

1. Receive/accept three laptops with serials `QA-LAPTOP-0001`, `0002`, `0003`.
2. Receive/accept 100 gloves, batch `QA-GLOVE-BATCH-01`, expiry 12 months ahead.
3. Record receipt/line IDs.

Expected: no over-receipt; physical goods require Module 4; no Asset/RFID IDs are created here.

### M2.4 Service acceptance

Record and independently verify installation completion.

Expected: service acceptance replaces goods receipt; physical verification/RFID/inventory are not required.

### M2.5 Enter invoices

**Login:** P06.

Create exact matching invoices:

```text
QA-INV-LAPTOP-001
QA-INV-GLOVE-001
QA-INV-SERVICE-001
```

Upload safe test PDFs and record IDs/revisions/hashes. Re-enter the laptop invoice number; expect duplicate rejection. Invoice entry must not move financial buckets.

### M2.6 Three-way match

**Login:** P07.

Match PO ↔ receipt/service acceptance ↔ invoice for all three. Confirm exact vendor/currency and policy-compliant quantity, price, tax, and freight. Record policy version.

Negative test: use a disposable correction with wrong currency or excess quantity. Expect blocked discrepancy. Restore current valid revision.

**Checkpoint:** Orders issued, goods received, service accepted, invoices entered/matched, no payment yet.

---

## 7. Module 3 — Verify invoice integrity, then pay

### M3.1 Integrity cases

**Login:** the separately seeded Module 3 investigator/analyst, never P06 who entered the invoice. **Open:** `/finance/invoice-integrity`.

Find each invoice, record case IDs, and confirm invoice revision/document hash matches Module 2.

### M3.2 Source verification and analysis

For each invoice:

1. Run approved QA connector or attach approved source snapshot.
2. Match vendor, account, order/transaction, amount, currency, lines, tax, freight.
3. Run deterministic extraction/comparison and risk analysis.

Expected: `SOURCE_MATCHED`, adequate coverage/confidence, no blockers, pinned policy and calculation hashes.

Negative test: wrong currency or source account must create a blocker even if numeric risk is low.

### M3.3 Human certification where required

Investigator recommends, logs out; independent certifier reviews the exact evidence set and certifies current invoice revision/hash.

Expected: investigator cannot certify their own case; offline/source-unavailable cases require two people; evidence-set hash is stored.

### M3.4 Payment eligibility and payment

Confirm Module 2 shows the current clearance projection and emits payment eligibility only when M2 match + M3 clearance match the current revision/hash.

**Login:** P08. Post each eligible payment with unique test references.

Expected: Committed → Expended once; idempotent retry does not duplicate; verify:

```text
Approved = Available + Open Commitment + Net Expended + Released
```

---

# PART B — VERIFY AND IDENTIFY PHYSICAL GOODS

## 8. Module 4 — Physical verification

### M4.1 Subjects

**Login:** P14. **Open:** `/finance/product-verification`.

Confirm three ITEM subjects (quantity 1 each) and one LOT subject (quantity 100). Record IDs. Installation must not create a subject.

### M4.2 Trusted capture

For each laptop:

1. Start server capture session.
2. Capture overview and manufacturer-label views with matching serial.
3. Complete before expiry with camera/location enabled.

For gloves, capture overview, batch/expiry label, and quantity evidence.

Expected: session/nonce/subject/tenant/view/freshness validated; original bytes hashed; geofence and accuracy recorded. Replaying a nonce or wrong subject fails.

### M4.3 Analyze

Run expected-versus-observed analysis. Inspect brand, model, serial/batch, specifications, quantity, and allocations.

Expected: attributes are `MATCHED`, `MISMATCHED`, `UNKNOWN`, or `NOT_APPLICABLE`; UNKNOWN reduces coverage; hard identifiers must match.

### M4.4 Independent review

Log out P14. Login P15. Review and clear all correct subjects.

Expected: P14 cannot review own capture; signed revocable identity per subject; subject-level `PhysicalProductVerified.v1`.

Negative test: wrong model/hidden identifier routes to discrepancy/manual review and cannot silently clear.

---

## 9. Module 5 — Permanent inventory

### M5.1 Prepare identities

**Login:** P17. **Open:** `/finance/inventory`.

Ingest four verified subjects. Confirm provenance/hashes, then prepare identities.

Expected:

- Each laptop: unique inventory UUID + University Asset ID.
- Gloves: one Lot ID, not 100 Asset IDs.
- Shared ProductModel does not merge physical ITEMs.
- Manufacturer serial is recorded, not university-generated.

Record all IDs.

### M5.2 State and balance

For Laptop 1 set/confirm:

```text
Owner: Physics Department
Custodian: QA Physics Lab Custodian
Location: Physics Lab A1
Lifecycle: AVAILABLE
```

These fields must have independent histories.

Glove lot must show initial RECEIPT 100 and on-hand 100. No manual balance update is permitted.

Negative tests: duplicate Asset ID, logical RFID, tag UID, and normalized manufacturer serial must block activation/allocation.

---

## 10. Module X — RFID, labels and gate

### MX.1 Request signed jobs

As P17, request one provisioning job for each laptop. Record IDs/expiry. Each job must bind exact inventory revision, Asset ID, logical RFID, nonce, policy and signature.

### MX.2 Encode, print and attach

**Login:** P18. **Open:** `/finance/physical-identity`.

For each laptop: claim job, encode approved tag, print Asset ID + signed QR + Code128, attach, submit result.

Expected: operator cannot type another Asset/RFID ID; replay/duplicate tag/stale job rejected; spoiled labels voided.

### MX.3 Independent verification

Log out P18. Login P19. Scan tag and product label/serial, then verify attachment.

Expected: P18 cannot verify own work; M5 validates `PhysicalIdentifierVerified.v1` and activates asset.

### MX.4 Public scan and gate

Anonymous QR scan must show only institutional ownership, product class, identity/verification status—not location, custodian, price, serial, funding or evidence.

Create approved permit for Laptop 1 and pass it through test gate. Login P20; expect `AUTHORIZED_PASSAGE`.

Pass Laptop 2 without permit; expect `REVIEW_REQUIRED`, never automatic theft/fraud classification.

---

# PART C — CONSUMABLES, RETURN, SERVICE AND RETIREMENT

## 11. Module 6 — Gloves operations

### M6.1 Request and reserve

**Login P21:** request 30 glove boxes for Physics Lab practical and submit.

**Login P22:** approve 30 and record reservation/allocation.

Expected: exact Lot ID allocated at approval; available-to-reserve 70, store on-hand still 100; requester cannot self-approve.

### M6.2 Issue, consume and return

**Login P23:** issue 20, then remaining 10.

Expected: store 70, issued custody 30, total university unconsumed 100.

**Login P21:** consume 20 and internally return unused 10.

Expected:

```text
Store on hand: 80
Issued custody: 0
Total university unconsumed: 80
```

Consumption must not subtract store stock twice.

### M6.3 Blind count/replenishment

**P24:** blind-count exact lot as 80; expected balance hidden.  
**P25:** review expected/count/variance and approve.

Use QA threshold to create replenishment suggestion and convert twice. Expect one Module 1 DRAFT only; no automatic funds/approval.

---

## 12. Module 7 — Return Laptop 2 as DOA

### M7.1 Submit exact-item return

**Login:** P26. **Open:** `/finance/returns`.

Create DOA case for exact Laptop 2, fault `Does not power on after receipt`, current discovery date, and safe evidence. Submit and record case.

Expected: Laptop 2 `RETURN_PENDING` hold; inventory/value not reduced; Laptop 1/3 unaffected; conflicting operations blocked.

### M7.2 Eligibility and approval

**P27:** compare server submission time with pinned DOA terms/evidence and decide `ELIGIBLE`. Current vendor policy must not overwrite purchase terms.

**P28:** approve `REPLACEMENT_UNIT`, exact allocation/value, record decision/hash.

Expected: initiator/reviewer cannot self-approve; Module 2 accepts only current active decision.

### M7.3 RMA/shipment

**P13:** record `QA-RMA-0001`, READY → SHIPPED → VENDOR_RECEIVED.

Expected: Laptop 2 returned; physical tag revoked; financial change only when Module 2 posts actual recovery.

### M7.4 Replacement

Process replacement through Module 2 receipt, Module 3 if applicable, new Module 4 subject, new Module 5 inventory/Asset ID, and new Module X tag.

Expected: no original subject, verification, inventory UUID, Asset ID, logical RFID or tag reuse; lineage points to returned subject.

---

## 13. Module 8 — Service Laptop 3

### M8.1 Report/hold

**Login:** P29. **Open:** `/finance/asset-service`.

Create corrective case for exact Laptop 3: `Intermittent power failure and overheating`. Submit.

Expected: service hold blocks assignment, transfer, return, retirement, RFID rebinding and another execution.

### M8.2 Triage/warranty/work

Authorized reviewer pins warranty and assigns P30.

**P30:** start work, diagnose `Mainboard power failure; unsafe overheating`, add tasks/evidence/tests, complete with `IRREPARABLE` or `UNSAFE`.

Expected: technician cannot accept own work; asset stays quarantined; Module 8 does not dispose; Module 9 referral published.

**P31:** independently accept the terminal technical outcome.

---

## 14. Module 9 — Retire Laptop 3

### M9.1 Case/assessment

**P32:** open referral for exact Laptop 3, reason `Irreparable and unsafe`, submit.

Expected: DB retirement hold blocks M5/M7/M8/legacy bypass.

**P33:** assess:

```text
Redeployment: no
Data-bearing: yes
Sanitization: required
Environmental class: e-waste
Method: CERTIFIED_E_WASTE
Proceeds: ₹0
NBV/disposal cost: Finance QA snapshot
```

### M9.2 ASSET_WRITEOFF DoFA

Submit pinned envelope and complete configured distinct approvals. Verify basis is maximum of absolute NBV, proceeds, and disposal cost.

Expected: approval does not dispose asset or post Finance; material changes require amendment.

### M9.3 Sanitization

**P34:** execute approved wipe/destruction and submit component/tool/standard/result/evidence.

**P35:** independently verify exact evidence hash.

Expected: P34 cannot self-verify; declaration alone cannot pass; no data-bearing asset leaves before verified sanitization/destruction.

### M9.4 Disposal

**P36:** select licensed QA provider, create exact Laptop 3 disposal lot, lock manifest; manage sealed offers if enabled.

**P37:** independently approve compliant award; below-reserve change requires amendment.

**P38:** scan Laptop 3, record pickup/provider/vehicle/time/location/witness/evidence, complete handover.

Expected: physical completion recorded; tag revoked; identity never reused; case remains open while Finance pending.

### M9.5 Finance failure/retry and certificate

Send idempotent Finance posting request. First simulate `FINANCE_POSTING_FAILED`; confirm history remains and case cannot close. Restore sandbox and retry same key; confirm no duplicate and authoritative settlement.

Request certificate before settlement: expect rejection.

After all gates, issue signed certificate and verify public-safe status.

Expected: certificate binds exact asset/revision, disposition, sanitization, custody, Finance references and evidence hash; corrections supersede, never overwrite.

---

## 15. Final expected state

| Record | Final result |
|---|---|
| Laptop 1 | Active, unique Asset/RFID, one authorized gate passage |
| Laptop 2 | Original returned and tag revoked |
| Replacement | New subject, inventory UUID, Asset ID and tag; lineage retained |
| Laptop 3 | Irreparable → sanitized → disposed → Finance settled → certificate |
| Gloves | Initial 100; consumed 20; store on-hand 80; custody 0 |
| Installation | Accepted/paid; physical verification and RFID not required |

---

## 16. Wrong-user and retry tests

For one record in every module:

1. P02 tries Dept A1 ID.
2. Tenant B user tries Tenant A ID.
3. Creator tries protected approval/checking step.
4. Repeat direct API call even when UI button is hidden.

Expected: `403` or safe `404`, no data leak, no successful business/audit row.

Mandatory same-user denials:

```text
requester ≠ DoFA approver
order creator ≠ receiver
invoice entrant ≠ verifier
investigator ≠ certifier
capturer ≠ reviewer
RFID encoder ≠ attachment verifier
stock requester ≠ approver
counter ≠ count approver
return initiator ≠ reviewer/approver
technician ≠ service acceptor
sanitization operator ≠ verifier
bid administrator ≠ sole award approver
award approver ≠ handover executor
```

For one mutation per module:

1. Repeat same `Idempotency-Key` + same payload: original result, no duplicate.
2. Same key + changed payload: `409`.
3. Save from browser A, then stale browser B: `409` with current revision.

Parallel-test budget, quantities, payments, IDs/tags, LOT reservations, holds, job claims and approvals. No overspend, negative balance, duplicate identity or duplicate event may occur.

---

## 17. Auditor review

**Login:** P39.

Search acquisition number and trace all items through Modules 1–9/X. Export authorized audit history. P39 must not mutate business records.

Audit proof must include actor, role, tenant/scope, time, entity/revision, transition, hashes, decision chain, event sequence, financial reconciliation, and inventory reconciliation.

---

## 18. Evidence and result format

Save for every step:

1. screenshot before and after;
2. redacted API request/response;
3. generated IDs;
4. expected/actual status;
5. audit row;
6. event/outbox row where applicable;
7. money/quantity calculation where applicable.

```text
Step ID:
Persona:
Date/time:
Input IDs:
Action:
Expected:
Actual:
PASS / FAIL / BLOCKED:
Evidence filename:
Defect ID:
```

Never save passwords, tokens, keys, OTPs, or unrestricted personal/vendor evidence.

Stop immediately for cross-tenant access, self-approval, negative money/stock, uncleared payment, stale clearance, duplicate identity, hold bypass, editable finalized evidence, reused disposed identity, premature certificate, or AI authoritative action.

---

## 19. Sign-off

```text
M1: PASS / FAIL / BLOCKED
M2: PASS / FAIL / BLOCKED
M3: PASS / FAIL / BLOCKED
M4: PASS / FAIL / BLOCKED
M5: PASS / FAIL / BLOCKED
MX: PASS / FAIL / BLOCKED
M6: PASS / FAIL / BLOCKED
M7: PASS / FAIL / BLOCKED
M8: PASS / FAIL / BLOCKED
M9: PASS / FAIL / BLOCKED

Tenant isolation: PASS / FAIL
Maker-checker: PASS / FAIL
Idempotency/stale revisions: PASS / FAIL
Concurrency: PASS / FAIL
Finance reconciliation: PASS / FAIL
Inventory reconciliation: PASS / FAIL
Audit provenance: PASS / FAIL

Tester: __________________  QA lead: __________________
Recommendation: APPROVE / REJECT / RETEST
```

Production activation remains blocked until QA, Finance, Procurement, Inventory, Security and the release authority approve the complete evidence.

Technical references: `docs/DOFA_MASTER_TESTING_QA_PLAN_V2.md`, `docs/TESTING_GUIDE.md`, and `backend/src/modules/*/*controller.ts`.
