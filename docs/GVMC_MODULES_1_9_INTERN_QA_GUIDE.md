# Falcon GVMC Intern QA Pack

## Production scope

- Portal: `https://falcon.jataka.io/?tenant=gvmc`
- Test tenant: Gyan Vihar Medical College (GVMC)
- Test path: Modules 1-9, with Module X as an optional physical-identity track.
- Use test products, test vendors and test amounts only.
- Do not use real patient, employee, student, vendor-bank or financial data.

These are dedicated production QA accounts. Passwords were rotated on 2026-09-30. Treat them as confidential, do not post them in chat or screenshots, and change them after first login if the portal asks.

## Accounts

| Code | Login | Main use |
| --- | --- | --- |
| G01 | `requester.gvmc@mygyanvihar.com` | Requester, stock requester, return/service/retirement initiator |
| G02 | `hod.gvmc@mygyanvihar.com` | HOD review and service acceptance |
| G03 | `college-approver.gvmc@mygyanvihar.com` | College/DoFA approval and disposal award |
| G04 | `procurement-operator.gvmc@mygyanvihar.com` | Procurement order and invoice entry |
| G05 | `procurement-review.gvmc@mygyanvihar.com` | Procurement review, invoice investigation, service triage, retirement assessment |
| G06 | `budget-integrity.gvmc@mygyanvihar.com` | Budget reservation and invoice-integrity certification |
| G07 | `payment.gvmc@mygyanvihar.com` | Payment and Finance/GL reconciliation |
| G08 | `receiving-stores.gvmc@mygyanvihar.com` | Receiving, verification capture, inventory, stores, service execution, disposal execution |
| G09 | `inventory-verifier.gvmc@mygyanvihar.com` | Independent verification, count approval, sanitization verification |
| G10 | `auditor.gvmc@mygyanvihar.com` | Read-only audit and provenance review |
| G11 | `tenant-admin.gvmc@mygyanvihar.com` | GVMC policy, scope, device and configuration administration |

The companion CSV contains the temporary passwords. Never paste the CSV into a ticket or public repository.

## How to record a test

For every scenario record:

1. Test ID and module.
2. Account code used.
3. Record ID, request ID, receipt ID or case ID.
4. Expected result.
5. Actual result.
6. Pass, fail or blocked.
7. Screenshot or downloaded evidence.
8. Browser console/network error, if any.

Use one controlled acquisition and its downstream records for the happy path. Create a second test record for rejection, mismatch, return or failure cases. Never reuse the same user for two maker-checker steps.

## Entry checks

1. Open the portal and sign in with the assigned account.
2. Confirm the tenant is GVMC.
3. Confirm only the account's allowed workspaces appear.
4. Confirm a direct URL outside the user's scope returns a structured access response, not another tenant's data.
5. For every mutation, refresh and reopen the record to confirm the saved state.
6. Capture the final ID and status after each module gate.

## Module 1 - Digital Acquisition

Suggested accounts: G01, G02, G03 and G06.

1. G01 opens Digital Acquisitions and creates a draft.
2. Select `GVMC test funding source`.
3. Add an asset, consumable and service line with integer quantities.
4. Enter a price per unit and optional notes/general information.
5. Confirm decimal quantity is rejected for an integer-only line.
6. Save draft, refresh, reopen and confirm all lines and totals remain.
7. Click Validate and confirm missing fields are explained clearly.
8. Submit a new revision and confirm the snapshot hash and revision increase.
9. G02 reviews the request and records the department decision.
10. G06 verifies budget reservation and exact acquisition-version linkage.
11. G03 completes the configured DoFA approval route.
12. Attempt to edit a submitted product, price or snapshot and confirm editing is blocked.

Pass gate: approved acquisition with a stable revision, funding source, budget reservation and audit trail.

## Module 2 - Procurement, Receipt and P2P

Suggested accounts: G04, G05, G06, G07 and G08.

1. G04 creates or opens the procurement batch from the approved acquisition.
2. Record vendor, order configuration, specification, quantity and price.
3. If a market change is needed, change the order only through the supported flow.
4. Confirm the mismatch and justification are logged; do not silently overwrite the approved facts.
5. G08 receives the shipment in GRN/Receiving.
6. Upload only a geotagged image of the unopened package with the shipping label and relevant details visible.
7. Confirm the original requester can later upload exact received-product images in the progressive data upload step.
8. G05 reviews the receipt and evidence.
9. G04 or the assigned invoice operator uploads the test invoice.
10. G05 performs invoice review; G06 certifies integrity; G07 performs payment only after the configured gate.
11. For a service/installation line, confirm the service acceptance option is available and the acceptance records the correct procurement line.

Pass gate: receipt, invoice, integrity and payment projections are linked to the correct procurement case without cross-request mixing.

## Module 3 - Invoice Integrity

Suggested accounts: G04, G05, G06 and G07.

1. G04 enters the invoice and document references.
2. Confirm G04 cannot certify or approve its own invoice.
3. G05 retrieves the invoice source and runs deterministic checks.
4. Record any discrepancy, missing evidence or mismatch.
5. G06 independently certifies the integrity decision.
6. G07 verifies that payment is blocked for rejected or stale clearance.
7. Re-run the same request with the same idempotency key and confirm no duplicate decision is created.
8. Reconsider a decision and confirm downstream payment must use the current revision.

Pass gate: the invoice has an immutable integrity decision, evidence hash and maker-checker history.

## Module 4 - Physical Product Verification

Suggested accounts: G08 and G09.

1. G08 creates a live capture session for an exact receipt subject.
2. For an asset, capture overview and manufacturer-label views.
3. For a consumable lot, capture overview, batch/expiry label and quantity evidence.
4. Confirm the server timestamp, tenant, subject, nonce, view type and geofence are recorded.
5. Try duplicate media, expired session, replayed nonce and wrong-tenant evidence; each must require recapture.
6. Run deterministic extraction and comparison.
7. Confirm outcomes distinguish `MATCHED`, `MISMATCHED`, `UNKNOWN` and `NOT_APPLICABLE`.
8. G09 independently reviews and clears or rejects the evidence.

Pass gate: a subject-level verification identity exists only after valid evidence and independent review.

## Module 5 - Inventory and Permanent Identity

Suggested accounts: G08 and G09.

1. Ingest the current Module 4 verified subject.
2. Confirm the correct ProductModel and physical receipt cohort/ProcurementBatch.
3. For an ITEM, allocate one University Asset ID and never create per-unit IDs for a LOT.
4. For a LOT, verify batch number, expiry/manufacture dates, unit and initial quantity.
5. G09 independently verifies identity preparation; G08 completes activation where permitted.
6. Confirm manufacturer serial is recorded, never generated by the university.
7. Test custody, owner, location and lifecycle as separate histories.
8. Test a duplicate normalized manufacturer serial and confirm activation is blocked.
9. Confirm a Module 4 revocation moves the record to quarantine without deleting history.

Pass gate: active inventory identity is reproducible from the current Module 4 identity and Module 2 source facts.

## Module 6 - Consumables Operations

Suggested accounts: G01, G02, G05, G08 and G09.

1. G01 submits a stock request for an exact ProductModel and unit.
2. G02 or G05 approves it; the requester cannot approve its own request.
3. Confirm approval allocates exact LOTs using FEFO, then FIFO fallback.
4. G08 issues part of the reservation and records recipient acknowledgement.
5. Record consumption against issued custody; confirm it does not subtract store stock twice.
6. Return unused stock and confirm `ISSUE_RETURN` restores store stock.
7. Try to reserve or issue expired, quarantined or depleted stock; confirm rejection.
8. Run the reservation expiry worker and confirm remaining allocations are released idempotently.
9. G09 performs a blind LOT-level count and independently approves the adjustment.
10. Trigger a low-stock alert and convert a replenishment suggestion to a Module 1 draft; confirm no automatic purchase is created.

Pass gate: Module 5 remains the only authoritative store-stock ledger.

## Module 7 - Returns and DOA

Suggested accounts: G01, G03, G05 and G08.

1. G01 starts a return for an exact ITEM or exact LOT quantity.
2. Confirm submission places a return hold without reducing inventory.
3. Test DOA evidence separately from standard-return evidence.
4. G05 reviews eligibility using the pinned acquisition/vendor policy.
5. G03 approves the disposition; the initiator cannot approve.
6. G08 records RMA, shipment and vendor receipt.
7. Confirm shipment changes only the selected ITEM or LOT quantity.
8. Test a replacement unit and confirm it gets a new subject, inventory UUID, Asset ID and verification identity.
9. Test a repaired original and confirm its Asset ID remains while Module 4 re-verification is required.
10. Supersede a decision before execution and confirm Module 2 rejects the old decision.

Pass gate: exact return allocation, hold, shipment, lineage and financial projection are preserved.

## Module 8 - Repairs, Warranty and Service

Suggested accounts: G01, G02, G05, G08 and G09.

1. G01 reports a corrective issue or accepts a Module 7 repair referral.
2. G05 triages warranty/AMC coverage and assigns the work.
3. G08 checks the asset into service; confirm only one active execution controls the asset.
4. For stocked parts, use Module 6 reservation, issue and consumption.
5. For chargeable work, confirm Modules 1-2 authorization is required before work starts.
6. Record diagnosis, tasks, evidence, labor, parts, tests and completion report.
7. For a material repair, request Module 4 re-verification.
8. G02 or an independent custodian accepts the completed work; the technician cannot accept its own work.
9. Confirm vendor custody cannot be changed by normal inventory actions.
10. For `IRREPARABLE` or `UNSAFE`, confirm quarantine remains and a Module 9 referral is created.

Pass gate: service completion, parts, cost projections, re-verification and acceptance are all reconciled.

## Module 9 - Retirement, Write-off and Disposal

Suggested accounts: G01, G03, G05, G06, G07, G08 and G09.

1. G01 requests retirement or the case arrives from Module 8.
2. Confirm the database-enforced retirement hold blocks assignment, service, return, RFID rebinding and legacy writes.
3. G05 completes technical, legal, environmental, data and valuation assessment.
4. G06/G07 review the read-only Finance/GL valuation and reconciliation projection.
5. G03 submits/approves the pinned `ASSET_WRITEOFF` DoFA envelope when assigned.
6. G08 performs sanitization or destruction preparation.
7. G09 independently verifies sanitization evidence.
8. Lock an exact disposal lot and test partial pickup; remaining assets must stay in retirement custody.
9. Test auction/award below reserve and confirm amendment/reapproval is required.
10. Record physical completion and then test Finance pending, failure and retry.
11. Confirm no completion certificate is issued while Finance or physical execution is incomplete.
12. After all gates pass, confirm signed certificate, online status, RFID revocation and final Module 5 lifecycle.

Pass gate: physical disposition and Finance/GL reconciliation are independently complete before closure.

## Optional Module X - Physical Identity and Gate Observation

Suggested accounts: G08, G09 and G11.

1. Module 5 issues a signed, single-use provisioning job.
2. G08 claims and executes the exact job; the kiosk cannot supply an Asset ID or RFID ID.
3. Encode RFID/NFC and print QR/Code128 labels.
4. G08 attaches the identifier; G09 independently verifies the physical tag and evidence.
5. Confirm Module 5, not Module X, activates the identity.
6. Send valid, expired, missing and superseded movement permits to a gate reader.
7. Confirm `AUTHORIZED_PASSAGE` and `REVIEW_REQUIRED` are distinct.
8. Test offline cache expiry and idempotent observation synchronization.

## Final acceptance checklist

- [ ] Every tested record has the correct GVMC tenant scope.
- [ ] Disabled or unauthorized workspaces do not appear or mutate data.
- [ ] Maker-checker rules hold for approval, payment, verification and disposal.
- [ ] Refresh/reopen does not lose saved data.
- [ ] Duplicate submissions and retries are idempotent.
- [ ] Stale revisions return a clear conflict.
- [ ] No cross-tenant or cross-department record is visible.
- [ ] Pending downstream work is shown as pending, never as completed.
- [ ] Evidence is immutable and downloadable only with authorization.
- [ ] Every gate has an event, actor, timestamp and audit trail.

## Defect template

**Title:**  
**Module and test ID:**  
**Account code:**  
**Record/case ID:**  
**Steps:**  
**Expected:**  
**Actual:**  
**Severity:** Blocker / Critical / Major / Minor  
**Evidence:** screenshot, console log, network response  
**Timestamp and browser:**  

## Stop conditions

Stop the flow and report immediately if you see another tenant's data, a duplicate financial/inventory movement, a missing audit event, a permission bypass, a stale decision being accepted, or an asset/lot quantity becoming negative.
