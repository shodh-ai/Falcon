# DoFA Master Testing and Quality Assurance Plan — Execution Edition

## Modules 1–9 + Module X

**Document status:** Proposed production test baseline  
**System of record:** Falcon  
**User/integration boundary:** IRMS  
**Applies to:** Module 1, 2, 3, 4, 5, X, 6, 7, 8 and 9  
**Release rule:** All feature flags remain disabled until the applicable gates in this plan pass.

---

## 1. Purpose and test objective

This plan proves that DoFA operates as one secure, auditable lifecycle rather than a collection of working screens.

```text
Module 1  Acquisition and approval
    ↓
Module 2  Procurement, receipt, invoice, payment and financial buckets
    ↓
Module 3  Invoice integrity and evidence clearance
    ↓
Module 4  Physical-product verification
    ↓
Module 5  Permanent inventory identity and inventory truth
    ↕
Module X  Physical RFID/QR provisioning and gate observation
    ↓
Module 6  Consumables operations
Module 7  Return/DOA orchestration
Module 8  Service, warranty and repair
Module 9  Retirement, sanitization and disposal
```

Testing must establish all of the following:

1. Each module satisfies its own contract.
2. Each authority boundary remains one-way.
3. Every persona can perform authorized work and is denied unauthorized work.
4. Maker-checker restrictions hold even when roles overlap.
5. Financial and quantity invariants survive concurrency, retry and failure.
6. Events remain safe under duplicates, gaps and out-of-order delivery.
7. Immutable history is sufficient for independent audit reconstruction.
8. Legacy projections continue to work but cannot bypass the canonical modules.
9. Feature flags permit safe shadow rollout and rollback.
10. Production-like load, hardware and failure conditions do not corrupt state.

Passing a UI happy path is not module acceptance.

---

## 2. Scope and exclusions

### 2.1 In scope

- Browser/PWA workflows and accessible keyboard operation.
- Falcon APIs, internal commands, workers and scheduled expiry jobs.
- PostgreSQL constraints, locks, immutable triggers and reconciliation queries.
- Object-storage ownership, hashes, malware results and signed downloads.
- OAuth/mTLS service authentication and device authentication.
- Transactional outbox, consumers, retries, dead-letter handling and recovery.
- Excel import/export for Modules 1 and 2.
- AI-assisted paths with deterministic authority controls.
- Real or approved simulated RFID, QR, barcode, printer and gate-reader paths.
- One-way legacy projections and direct-write rejection.
- Tenant, campus, department, laboratory, project and location scope.

### 2.2 Out of scope unless separately commissioned

- Public auction marketplace and bidder deposits.
- General fraud accusation or automated blacklisting.
- Manufacturer serial generation.
- Financial ledger ownership outside Module 2/Finance GL.
- Permanent inventory identity creation outside Module 5.
- Production credentials or production signing-key material in any test environment.

---

## 3. Test governance

### 3.1 Owners

| Area | Accountable owner | Required sign-off |
|---|---|---|
| Functional correctness | Product owner | Module business owner |
| Financial invariants | Finance controller | CFO delegate/Internal Audit |
| Procurement rules | Procurement head | Finance and Stores |
| Inventory quantities/identity | Inventory authority | Internal Audit |
| Security/privacy | Security lead | Data protection/technology owner |
| Hardware provisioning | Inventory + IT infrastructure | Security/Stores |
| UAT | Business process owner | Named persona representatives |
| Release decision | Release authority | Product, Finance, Security and Operations |

### 3.2 Test independence

- Developers may execute unit and component tests.
- QA independently executes integration, negative, recovery and regression tests.
- Security testing is performed by personnel independent from feature development.
- UAT uses actual role-specific accounts; testers must not switch roles on one account to simulate maker-checker independence.
- Financial and inventory reconciliation evidence must be reviewed by a second tester.

### 3.3 Entry criteria

Testing may begin only when:

- build/version and migration set are uniquely identified;
- required feature flags are documented;
- test keys and non-production certificates are installed;
- policy, DoFA, category, identifier and retention versions are published;
- required personas and scopes are provisioned;
- baseline test data is loaded and checksummed;
- queues, object storage, workers and observability are available;
- rollback and database restoration procedures are documented.

---

## 4. Permanent system invariants

| ID | Invariant | Minimum proof |
|---|---|---|
| INV-01 | No cross-tenant or cross-scope read/write succeeds. | API + direct-object ID negative tests and query evidence |
| INV-02 | Submitted/finalized records cannot be overwritten or deleted. | API rejection + database trigger/row comparison |
| INV-03 | Corrections create amendments, revisions, reversals or superseding records. | Old/new record and hash evidence |
| INV-04 | Significant actions are attributable to actor, role, time and revision. | Audit-chain query |
| INV-05 | Identical idempotent retries return the original effect. | Same response/business IDs and one ledger/event row |
| INV-06 | Changed payload with the same idempotency key returns `409`. | API transcript |
| INV-07 | Concurrency cannot overspend funds or oversubscribe quantities. | parallel-run evidence + ledger reconstruction |
| INV-08 | Duplicate/out-of-order events do not overwrite newer state. | consumer checkpoint and state comparison |
| INV-09 | Downstream modules cannot rewrite upstream authority. | denied API/DB/legacy mutation |
| INV-10 | Legacy projections are never a second writable authority. | projection source ID + write rejection |
| INV-11 | AI cannot clear, reject, approve, pay, allocate identity or classify fraud. | outage/malformed/prompt-injection tests |
| INV-12 | Maker-checker restrictions apply to user identity, not merely role name. | same-user/different-role negative tests |
| INV-13 | Evidence, payload and signature tampering fails closed. | altered-byte/hash/signature tests |
| INV-14 | Every asset traces to acquisition, order, receipt, invoice and verification. | provenance export |
| INV-15 | Financial totals reconstruct from append-only entries. | independent reconciliation script |
| INV-16 | Inventory and custody totals reconstruct from movements. | independent reconciliation script |
| INV-17 | Permanent IDs and physical identities are never reused. | unique constraint + replacement/retirement tests |
| INV-18 | Feature-flag disablement stops new gated work without corrupting open history. | flag rollback scenario |
| INV-19 | Every event contains valid tenant, aggregate, sequence, version and payload hash. | outbox validation query |
| INV-20 | Public scans expose only public-safe fields and current validity. | anonymous response inspection |

All INV tests are release-blocking and must remain in automated regression.

---

## 5. Test environments

| Environment | Primary purpose | Data | Hardware/external systems |
|---|---|---|---|
| DEV | unit, component and developer smoke | synthetic | mocks/simulator |
| CI | clean migrations, contracts, deterministic regression | recreated per run | deterministic mocks |
| QA | functional, API, DB and integration testing | synthetic masked data | sandbox connectors |
| SECURITY | adversarial and penetration testing | isolated synthetic | isolated connector targets |
| HARDWARE-QA | RFID/printer/gate/device tests | synthetic physical assets | approved real devices |
| PERFORMANCE | load, soak, worker backlog and recovery | generated scale data | simulated readers/connectors |
| UAT | persona/business acceptance | approved realistic data | sandbox/selected real devices |
| STAGING | production-equivalent release rehearsal | masked or synthetic | production-equivalent configuration |

Staging must match production database version, queue topology, object storage policy, encryption configuration, reverse proxy, mTLS enforcement, workers, schedules and feature-flag behavior. Production secrets must never be copied.

---

## 6. Persona and role test catalog

Each persona must have a dedicated account, tenant, department/project/location scope and stable test identifier. Create a second tenant with equivalent records for isolation tests.

### 6.1 Persona accounts

| ID | Persona / representative role | Primary permitted work | Mandatory denied checks |
|---|---|---|---|
| P01 | Acquisition Requester (`Faculty`/`LabAdmin`) | Module 1 draft, submit, amend, withdraw own scoped request | vendor review, budget posting, own approval, other department request |
| P02 | Other-department Requester | same actions in Department B | read/write Department A IDs |
| P03 | Procurement Buyer (`ProcurementBuyer`) | vendor review, order draft, vendor coordination | DoFA approval, receipt acceptance, Finance posting |
| P04 | Procurement Head | vendor exception, order issuance, return exception oversight | payment posting, self-created exception sole approval |
| P05 | Budget Officer (`FinanceController`) | budget check/reservation oversight | alter submitted acquisition, vendor selection |
| P06 | Invoice Entrant (`APClerk`) | enter invoice, upload document, correction request | verify own invoice, certify integrity, post payment |
| P07 | Invoice Verifier (`APManager`) | three-way-match verification/dispute | verify own entered invoice, Module 3 certification if investigator |
| P08 | Finance Payment Poster (`Accountant`) | authorized payment/refund posting | edit prior ledger entry, pay stale/uncleared invoice |
| P09 | DoFA L1 (`HOD`) | scoped L1 approval | own request, out-of-scope department, repeat signature |
| P10 | DoFA L2 (`Dean`) | scoped L2 approval | substitute for distinct L1 signature using same user |
| P11 | DoFA Finance/Executive (`CFO`/`COO`) | high-value route decisions | alter pinned route/policy snapshot |
| P12 | Receiving Clerk (`ReceivingClerk`) | receipt entry and rejection | receive order they created, invoice/payment mutation |
| P13 | Stores Operator (`Stores`) | stores receipt/custody, issue, return shipment | approve own protected count/return transition |
| P14 | Physical Capturer | Module 4 capture sessions/evidence | review own capture, gallery/session bypass |
| P15 | Physical Reviewer | Module 4 review and evidence requests | approve capture they performed |
| P16 | Physical Exception Approver (`ProcurementHead`) | permitted non-material exception | material substitution or tampering override |
| P17 | Inventory Identity Preparer | Module 5 prepare Asset/Lot identity | independent verification, arbitrary manufacturer serial generation |
| P18 | RFID Encoder / kiosk operator | execute signed Module X job | choose or modify Asset/RFID identity, verify own attachment |
| P19 | RFID Attachment Verifier | independent physical scan/verification | encode same job, activate inventory directly |
| P20 | Gate Security Operator (`Security`) | observe/acknowledge/resolve review alerts | create permit, classify theft automatically, view restricted finance |
| P21 | Consumables Requester | stock request and own custody consumption | approve request, issue store stock directly |
| P22 | Stock Approver | approve and reserve exact LOTs | approve own request, bypass expired LOT rule |
| P23 | Stock Issuer | exact allocation issue and acknowledgement capture | consume on recipient's behalf unless separately authorized |
| P24 | Stock Counter | blind LOT count | see expected balance, approve own count |
| P25 | Count Approver | review/recount/adjustment authorization | counter and reviewer same user |
| P26 | Return Initiator | exact ITEM/LOT Return/DOA submission | eligibility decision, approval, financial posting |
| P27 | Return Eligibility Reviewer | policy/evidence decision | review own initiated case |
| P28 | Return Approver | disposition approval/exception | inventory transition or Finance recovery posting |
| P29 | Service Reporter/Custodian | fault/warranty request | triage approval, final acceptance as technician |
| P30 | Service Technician / provider | diagnosis, tasks, evidence, completion | eligibility exception, estimate financial approval, own acceptance |
| P31 | Service Acceptor | independent return acceptance | execute same service work |
| P32 | Retirement Requester/Custodian | retirement request | assessment, DoFA decision, disposal execution |
| P33 | Retirement Assessor/Appraiser | technical/valuation assessment | final approval when appraiser identity conflicts |
| P34 | Sanitization Operator | perform wipe/destruction and evidence | verify own sanitization |
| P35 | Sanitization Verifier | independent verification | execute same sanitization job |
| P36 | Bid Administrator | bidder enrollment, sealed-offer administration | sole evaluation/award approval |
| P37 | Disposal Award Approver | committee award approval | execute handover as same user |
| P38 | Disposal Executor/Witness | exact manifest handover or witness | executor and independent witness same user |
| P39 | Internal Auditor | read-only scoped/university audit and export | any business mutation or secret/evidence overreach |
| P40 | Tenant Admin | tenant policy/device/user administration | cross-tenant access, business approval by administration alone |
| P41 | Super Admin | explicitly granted platform administration | implicit tenant business authority without grant |
| P42 | External Service Provider | case-specific Module 8 tasks/evidence | other cases, warranty decision, custody return approval |
| P43 | IRMS Service Identity | scoped acquisition/API exchange | interactive user actions, cross-tenant token use |
| P44 | Module X Device Identity | signed machine endpoints for assigned profile/gate | user endpoints, other gate/device, stale sequence |
| P45 | Anonymous/Public Scanner | public-safe QR/RFID/certificate result | serial, custodian, exact location, price, evidence or funding |

### 6.2 Required account variations

For P01–P45, add variations where applicable:

- active vs disabled account;
- correct vs wrong tenant;
- same tenant but wrong department/project/location;
- expired grant;
- overlapping roles on the same user;
- temporary delegated approval;
- revoked device/service credential;
- user with role label but without capability grant;
- capability grant with insufficient object scope.

### 6.3 Persona validation protocol

Every persona must execute four classes of tests:

1. **Positive:** allowed action on an in-scope object succeeds.
2. **Horizontal denial:** same action on another department/project/location fails as `404` or policy-safe denial.
3. **Vertical denial:** a higher-risk capability not granted to the persona returns `403`.
4. **Maker-checker denial:** a permitted capability is still rejected when the same user created the protected prior action.

Validate through UI and direct API. Hiding a button is not authorization proof.

### 6.4 Segregation-of-duty matrix

| Test ID | First actor | Protected second action | Expected |
|---|---|---|---|
| SOD-01 | P01 Requester | P09 approval by same user identity | blocked |
| SOD-02 | P03 order creator | P12 receipt by same user | blocked |
| SOD-03 | P06 invoice entrant | P07 invoice verification by same user | blocked |
| SOD-04 | Module 3 investigator | Finance certifier using same user | blocked |
| SOD-05 | Finance certifier | P08 payment posting by same user | blocked |
| SOD-06 | P14 physical capturer | P15 physical review by same user | blocked |
| SOD-07 | P18 RFID encoder | P19 attachment verification by same user | blocked |
| SOD-08 | P21 stock requester | P22 stock approval by same user | blocked |
| SOD-09 | P24 stock counter | P25 count approval by same user | blocked |
| SOD-10 | P26 return initiator | P27/P28 eligibility or approval by same user | blocked |
| SOD-11 | P30 technician/provider | P31 service acceptance by same user | blocked |
| SOD-12 | P34 sanitization operator | P35 sanitization verification by same user | blocked |
| SOD-13 | P36 bid administrator | sole bid evaluator/award approver | blocked |
| SOD-14 | P37 award approver | P38 handover executor by same user | blocked |
| SOD-15 | Module 9 approver | Finance/GL poster by same user where prohibited | blocked |

Each SOD case must also be repeated with a single account holding both role names. The user identity—not role switching—must cause rejection.

### 6.5 Capability-to-persona validation matrix

The test administrator must verify the actual capability grant, not infer authority from the displayed role name.

| Module | Capability family to validate | Positive personas | Negative personas to exercise |
|---|---|---|---|
| 1 | `ACQUISITION_REQUESTER` | P01/P02 | P03, P08, P39 |
| 1 | `ACQUISITION_VENDOR_REVIEW` | P03/P04 | P01, P05, P12 |
| 1 | `ACQUISITION_BUDGET_OVERSIGHT` | P05 | P01, P03, P12 |
| 1 | `ACQUISITION_AUDIT_OVERSIGHT` | P39 | all ordinary business personas |
| 2 | `PROCUREMENT_VIEW` | scoped P01/P03–P08/P12/P39 | other tenant/department user |
| 2 | `PROCUREMENT_ORDER_ENTRY` | P03/P04 | P01, P06, P12 |
| 2 | `PROCUREMENT_RECEIPT_ENTRY` | P12 | P03 creator, P06, P08 |
| 2 | `PROCUREMENT_INVOICE_ENTRY` | P06 | P01, P12, P20 |
| 2 | `PROCUREMENT_INVOICE_VERIFY` | P07 | P06 entrant, P12 |
| 2 | `PROCUREMENT_PAYMENT_POST` | P08 | P06/P07, requester |
| 2 | `PROCUREMENT_IMPORT_ADMIN` | designated import admin | requester without import grant |
| 2 | `PROCUREMENT_AUDIT_VIEW` | P39 | ordinary requester |
| 3 | `INVOICE_INTEGRITY_VIEW` | P06–P08/P39 as scoped | requester without evidence access |
| 3 | `INVOICE_SOURCE_MANAGE` | source administrator | P06/P07/P42 |
| 3 | `INVOICE_SOURCE_RETRIEVE` | authorized retrieval operator | requester/external provider |
| 3 | `INVOICE_INTEGRITY_ANALYZE` | integrity analyst | invoice entrant without analyst grant |
| 3 | `INVOICE_INTEGRITY_INVESTIGATE` | investigator | P06 submitter |
| 3 | `INVOICE_INTEGRITY_CERTIFY` | independent certifier | investigator/same invoice entrant |
| 3 | `INVOICE_INTEGRITY_POLICY_ADMIN` | P40/P41 as explicitly granted | Finance operational users |
| 3 | `INVOICE_INTEGRITY_AUDIT` | P39 | requesters/providers |
| 4 | `PRODUCT_VERIFICATION_CAPTURE` | P14 | P15-only reviewer, requester |
| 4 | `PRODUCT_VERIFICATION_ANALYZE` | analysis service/operator | external provider/requester |
| 4 | `PRODUCT_VERIFICATION_REVIEW` | P15 | P14 same user |
| 4 | `PRODUCT_VERIFICATION_EXCEPTION_APPROVE` | P16 | P14/P15 without exception grant |
| 4 | `PRODUCT_VERIFICATION_POLICY_ADMIN` | P40/P41 | Stores/capturer |
| 4 | `PRODUCT_VERIFICATION_AUDIT` | P39 | ordinary capturer |
| 5 | `INVENTORY_INGEST` / `INVENTORY_IDENTITY_PREPARE` | P17 | requester/P18 device operator |
| 5 | `INVENTORY_IDENTITY_VERIFY` | independent inventory verifier | P17 same user |
| 5 | `INVENTORY_RFID_ENCODE` | internal Module X command only when gate enabled | browser/operator direct endpoint |
| 5 | `INVENTORY_ASSIGN` / `INVENTORY_TRANSFER` | scoped inventory authority | custodian without transfer grant |
| 5 | `INVENTORY_LOT_MOVEMENT` | authorized inventory/Module 6 command | arbitrary requester |
| 5 | `INVENTORY_DISCREPANCY_REPORT` | scoped users | public scanner |
| 5 | `INVENTORY_DISCREPANCY_RESOLVE` | independent resolver | discrepancy reporter same user |
| 5 | `INVENTORY_FINANCIAL_VIEW` | Finance/auditor scope | public/custodian without grant |
| 5 | `INVENTORY_LEGACY_RECONCILE` | reconciliation authority | ordinary inventory operator |
| X | `PHYSICAL_IDENTITY_PROVISION` / `RETROFIT` | P17/P18 workflow | P19, P20, public user |
| X | `PHYSICAL_IDENTITY_ATTACH_VERIFY` | P19 | P18 same user |
| X | `PHYSICAL_IDENTITY_DEVICE_ADMIN` | P40/P41 | kiosk operator/security operator |
| X | `GATE_ASSET_OBSERVE` | P20/P44 | requester/public scanner |
| X | `GATE_ASSET_REVIEW` / `GATE_ASSET_ESCALATE` | P20 with appropriate level | device identity, requester |
| 6 | `CONSUMABLES_REQUEST` | P21 | P22/P23 when acting outside requester scope |
| 6 | `CONSUMABLES_APPROVE` | P22 | P21 same user |
| 6 | `CONSUMABLES_ISSUE` | P23 | P21 requester |
| 6 | `CONSUMABLES_CONSUMPTION_RECORD` | P21/custodian as scoped | Stores for unrelated custody |
| 6 | `CONSUMABLES_EMERGENCY_ISSUE` | designated emergency issuer | normal issuer without emergency grant |
| 6 | `CONSUMABLES_EMERGENCY_REVIEW` | independent reviewer | emergency issuer same user |
| 6 | `CONSUMABLES_COUNT` / `COUNT_APPROVE` | P24 / P25 | same user on both steps |
| 6 | `CONSUMABLES_REPLENISHMENT_CONVERT` | authorized requester | alert viewer/worker |
| 7 | `RETURNS_INITIATE` | P26 | external provider/public user |
| 7 | `RETURNS_ELIGIBILITY_REVIEW` | P27 | P26 same user |
| 7 | `RETURNS_APPROVE` / `RETURNS_RECONSIDER` | P28 | P26/P27 where separation applies |
| 7 | `RETURNS_VENDOR_COORDINATE` / `RETURNS_SHIP` | P13/vendor coordinator | requester without grant |
| 7 | `RETURNS_POLICY_ADMIN` / `RETURNS_AUDIT` | P40/P39 | operational personas |
| 8 | `ASSET_SERVICE_REQUEST` | P29 | public user/provider outside assignment |
| 8 | `ASSET_SERVICE_TRIAGE` / `ASSIGN` | service desk | P29 reporter |
| 8 | `ASSET_SERVICE_EXECUTE` | P30 | unassigned provider/P29 |
| 8 | `ASSET_SERVICE_WARRANTY_REVIEW` / `WARRANTY_EXCEPTION` | distinct reviewers | technician/provider |
| 8 | `ASSET_SERVICE_ESTIMATE_APPROVE` | authorized approver | estimate creator |
| 8 | `ASSET_SERVICE_PARTS_MANAGE` | parts authority | service reporter |
| 8 | `ASSET_SERVICE_ACCEPT` | P31 | P30 same user/provider |
| 8 | `ASSET_SERVICE_RETIREMENT_REFER` | authorized technical authority | external provider alone |
| 9 | `ASSET_RETIREMENT_REQUEST` | P32 | public/provider |
| 9 | `ASSET_RETIREMENT_ASSESS` | P33 | P32 same user |
| 9 | `ASSET_RETIREMENT_VALUATION_VIEW` | Finance/P33 as scoped | bidder/provider/public |
| 9 | `ASSET_RETIREMENT_DOFA_SUBMIT` | retirement authority | assessor without submit grant |
| 9 | `ASSET_SANITIZATION_EXECUTE` / `VERIFY` | P34 / P35 | same user on both steps |
| 9 | `ASSET_DISPOSAL_PREPARE` / `BID_MANAGE` | P36 | bidder/public |
| 9 | `ASSET_DISPOSAL_AWARD` | P37 | conflicted P36/bidder |
| 9 | `ASSET_DISPOSAL_EXECUTE` / `ACCEPT` | distinct P38 actors | buyer/provider as university acceptor |
| 9 | `ASSET_RETIREMENT_RECONCILE` | Finance reconciliation authority | disposal executor |
| 9 | policy/provider administration and audit | P40/P39 | business operators without grant |

For each row record the grant row, token claims, requested object scope, HTTP result and resulting business/audit rows. Role-based UI visibility must match—but never replace—the backend decision.

### 6.6 Executable QA/UAT credential registry

The following credentials are test fixtures, not production accounts. They must be seeded only in disposable CI, QA, SECURITY, HARDWARE-QA and UAT environments. The seed process must refuse to run when `NODE_ENV=production` or when the database is marked as production. Passwords must be replaced through the environment secret store where policy forbids committed test credentials.

Default login endpoint:

```text
POST /auth/local-login
{
  "email": "<login ID>",
  "password": "<test password>"
}
```

| Persona | Login ID | Test password | Tenant / default scope | Account purpose |
|---|---|---|---|---|
| P01 | `qa.dofa.p01.requester.a@mygyanvihar.test` | `DofaQA!P01#2026` | Tenant A / Campus A1 / Dept A1 / Lab A1 | acquisition requester |
| P02 | `qa.dofa.p02.requester.b@mygyanvihar.test` | `DofaQA!P02#2026` | Tenant A / Campus A1 / Dept A2 / Lab A2 | other-department requester |
| P03 | `qa.dofa.p03.buyer@mygyanvihar.test` | `DofaQA!P03#2026` | Tenant A / Procurement | procurement buyer |
| P04 | `qa.dofa.p04.procurement-head@mygyanvihar.test` | `DofaQA!P04#2026` | Tenant A / university procurement | procurement head |
| P05 | `qa.dofa.p05.budget@mygyanvihar.test` | `DofaQA!P05#2026` | Tenant A / Finance | budget officer |
| P06 | `qa.dofa.p06.invoice-entry@mygyanvihar.test` | `DofaQA!P06#2026` | Tenant A / AP entry | invoice entrant |
| P07 | `qa.dofa.p07.invoice-verify@mygyanvihar.test` | `DofaQA!P07#2026` | Tenant A / AP verification | invoice verifier |
| P08 | `qa.dofa.p08.payment@mygyanvihar.test` | `DofaQA!P08#2026` | Tenant A / Finance posting | payment/refund poster |
| P09 | `qa.dofa.p09.hod-a1@mygyanvihar.test` | `DofaQA!P09#2026` | Tenant A / Dept A1 | DoFA L1 |
| P10 | `qa.dofa.p10.dean-a@mygyanvihar.test` | `DofaQA!P10#2026` | Tenant A / Campus A1 | DoFA L2 |
| P11 | `qa.dofa.p11.executive@mygyanvihar.test` | `DofaQA!P11#2026` | Tenant A / university | executive/Finance DoFA |
| P12 | `qa.dofa.p12.receiving@mygyanvihar.test` | `DofaQA!P12#2026` | Tenant A / Stores A1 | receiving clerk |
| P13 | `qa.dofa.p13.stores@mygyanvihar.test` | `DofaQA!P13#2026` | Tenant A / Stores A1 | stores operator |
| P14 | `qa.dofa.p14.capturer@mygyanvihar.test` | `DofaQA!P14#2026` | Tenant A / Receiving A1 | physical capturer |
| P15 | `qa.dofa.p15.physical-review@mygyanvihar.test` | `DofaQA!P15#2026` | Tenant A / Receiving A1 | physical reviewer |
| P16 | `qa.dofa.p16.physical-exception@mygyanvihar.test` | `DofaQA!P16#2026` | Tenant A / Procurement | physical exception approver |
| P17 | `qa.dofa.p17.identity-prepare@mygyanvihar.test` | `DofaQA!P17#2026` | Tenant A / Inventory A1 | inventory identity preparer |
| P18 | `qa.dofa.p18.rfid-encode@mygyanvihar.test` | `DofaQA!P18#2026` | Tenant A / Kiosk A1 | RFID/kiosk operator |
| P19 | `qa.dofa.p19.rfid-verify@mygyanvihar.test` | `DofaQA!P19#2026` | Tenant A / Inventory A1 | attachment verifier |
| P20 | `qa.dofa.p20.gate-security@mygyanvihar.test` | `DofaQA!P20#2026` | Tenant A / Gate A1 | gate security operator |
| P21 | `qa.dofa.p21.stock-request@mygyanvihar.test` | `DofaQA!P21#2026` | Tenant A / Dept A1 / Lab A1 | consumables requester |
| P22 | `qa.dofa.p22.stock-approve@mygyanvihar.test` | `DofaQA!P22#2026` | Tenant A / Stores A1 | stock approver |
| P23 | `qa.dofa.p23.stock-issue@mygyanvihar.test` | `DofaQA!P23#2026` | Tenant A / Stores A1 | stock issuer |
| P24 | `qa.dofa.p24.stock-count@mygyanvihar.test` | `DofaQA!P24#2026` | Tenant A / Stores A1 | blind stock counter |
| P25 | `qa.dofa.p25.count-approve@mygyanvihar.test` | `DofaQA!P25#2026` | Tenant A / Stores A1 | count approver |
| P26 | `qa.dofa.p26.return-initiate@mygyanvihar.test` | `DofaQA!P26#2026` | Tenant A / Dept A1 | Return/DOA initiator |
| P27 | `qa.dofa.p27.return-eligibility@mygyanvihar.test` | `DofaQA!P27#2026` | Tenant A / Procurement | return eligibility reviewer |
| P28 | `qa.dofa.p28.return-approve@mygyanvihar.test` | `DofaQA!P28#2026` | Tenant A / Procurement | return disposition approver |
| P29 | `qa.dofa.p29.service-report@mygyanvihar.test` | `DofaQA!P29#2026` | Tenant A / Dept A1 / Lab A1 | service reporter/custodian |
| P30 | `qa.dofa.p30.technician@mygyanvihar.test` | `DofaQA!P30#2026` | Tenant A / Service Centre A1 | internal technician |
| P31 | `qa.dofa.p31.service-accept@mygyanvihar.test` | `DofaQA!P31#2026` | Tenant A / Dept A1 | independent service acceptor |
| P32 | `qa.dofa.p32.retirement-request@mygyanvihar.test` | `DofaQA!P32#2026` | Tenant A / Dept A1 | retirement requester |
| P33 | `qa.dofa.p33.retirement-assess@mygyanvihar.test` | `DofaQA!P33#2026` | Tenant A / Asset authority | assessor/appraiser |
| P34 | `qa.dofa.p34.sanitize@mygyanvihar.test` | `DofaQA!P34#2026` | Tenant A / Sanitization site A1 | sanitization operator |
| P35 | `qa.dofa.p35.sanitize-verify@mygyanvihar.test` | `DofaQA!P35#2026` | Tenant A / Sanitization site A1 | sanitization verifier |
| P36 | `qa.dofa.p36.bid-admin@mygyanvihar.test` | `DofaQA!P36#2026` | Tenant A / Disposal office | bid administrator |
| P37 | `qa.dofa.p37.disposal-award@mygyanvihar.test` | `DofaQA!P37#2026` | Tenant A / Disposal committee | award approver |
| P38 | `qa.dofa.p38.disposal-execute@mygyanvihar.test` | `DofaQA!P38#2026` | Tenant A / Disposal site A1 | handover executor |
| P39 | `qa.dofa.p39.auditor@mygyanvihar.test` | `DofaQA!P39#2026` | Tenant A / university read-only | internal auditor |
| P40 | `qa.dofa.p40.tenant-admin@mygyanvihar.test` | `DofaQA!P40#2026` | Tenant A / tenant administration | tenant admin |
| P41 | `qa.dofa.p41.super-admin@mygyanvihar.test` | `DofaQA!P41#2026` | platform administration | super admin without implicit business grants |
| P42 | `qa.dofa.p42.external-provider@provider.test` | `DofaQA!P42#2026` | Tenant A / assigned service case only | external service provider |

Machine and public personas do not use human passwords:

| Persona | Authentication ID | Test secret/credential | Scope |
|---|---|---|---|
| P43 | OAuth client `qa-dofa-irms-tenant-a` | Secret reference `vault://qa/dofa/irms-tenant-a` | Tenant A acquisition integration only |
| P44 | Device ID `qa-dofa-kiosk-a1-001` | mTLS cert `qa-dofa-kiosk-a1-001` + device key reference `vault://qa/dofa/devices/kiosk-a1-001` | Tenant A / Campus A1 / Kiosk and Gate A1 |
| P45 | `ANONYMOUS` | none | public-safe scan endpoints only |

The values beginning with `vault://` are references, not literal secrets. CI creates short-lived credentials and exposes them only to the relevant test job.

### 6.7 Dedicated maker-checker conflict accounts

These accounts deliberately hold both role/capability families. They prove that segregation is enforced using the actor's user ID rather than the active role label.

| Conflict ID | Login ID | Test password | Combined authorities | Required negative tests |
|---|---|---|---|---|
| C01 | `qa.dofa.c01.requester-hod@mygyanvihar.test` | `DofaQA!C01#2026` | requester + HOD | SOD-01 |
| C02 | `qa.dofa.c02.buyer-receiver@mygyanvihar.test` | `DofaQA!C02#2026` | order entry + receipt entry | SOD-02 |
| C03 | `qa.dofa.c03.invoice-entry-verify@mygyanvihar.test` | `DofaQA!C03#2026` | invoice entry + invoice verification | SOD-03 |
| C04 | `qa.dofa.c04.investigator-certifier@mygyanvihar.test` | `DofaQA!C04#2026` | integrity investigation + certification | SOD-04 |
| C05 | `qa.dofa.c05.certifier-payment@mygyanvihar.test` | `DofaQA!C05#2026` | integrity certification + payment posting | SOD-05 |
| C06 | `qa.dofa.c06.capture-review@mygyanvihar.test` | `DofaQA!C06#2026` | physical capture + review | SOD-06 |
| C07 | `qa.dofa.c07.encode-verify@mygyanvihar.test` | `DofaQA!C07#2026` | RFID encoding + attachment verification | SOD-07 |
| C08 | `qa.dofa.c08.stock-request-approve@mygyanvihar.test` | `DofaQA!C08#2026` | consumables request + approval | SOD-08 |
| C09 | `qa.dofa.c09.count-review@mygyanvihar.test` | `DofaQA!C09#2026` | stock count + count approval | SOD-09 |
| C10 | `qa.dofa.c10.return-all@mygyanvihar.test` | `DofaQA!C10#2026` | return initiation + eligibility + approval | SOD-10 |
| C11 | `qa.dofa.c11.technician-accept@mygyanvihar.test` | `DofaQA!C11#2026` | service execution + acceptance | SOD-11 |
| C12 | `qa.dofa.c12.sanitize-verify@mygyanvihar.test` | `DofaQA!C12#2026` | sanitization execution + verification | SOD-12 |
| C13 | `qa.dofa.c13.bid-award@mygyanvihar.test` | `DofaQA!C13#2026` | bid administration + award | SOD-13 |
| C14 | `qa.dofa.c14.award-handover@mygyanvihar.test` | `DofaQA!C14#2026` | disposal award + handover | SOD-14 |
| C15 | `qa.dofa.c15.writeoff-finance@mygyanvihar.test` | `DofaQA!C15#2026` | Module 9 approval + Finance posting | SOD-15 |

### 6.8 Cross-tenant and account-state credentials

| Test identity | Login ID | Test password | Purpose |
|---|---|---|---|
| Tenant B requester | `qa.dofa.requester@tenant-b.test` | `DofaQA!TB01#2026` | replace Tenant A object IDs in all IDOR cases |
| Tenant B admin | `qa.dofa.admin@tenant-b.test` | `DofaQA!TB02#2026` | prove admin authority remains tenant-bound |
| Disabled user | `qa.dofa.disabled@mygyanvihar.test` | `DofaQA!DIS#2026` | authentication rejection |
| Expired-grant user | `qa.dofa.expired-grant@mygyanvihar.test` | `DofaQA!EXP#2026` | valid login but authorization denial |
| Role-without-grant user | `qa.dofa.role-no-grant@mygyanvihar.test` | `DofaQA!RNG#2026` | role label must not grant authority |
| Grant-wrong-scope user | `qa.dofa.wrong-scope@mygyanvihar.test` | `DofaQA!WSC#2026` | capability present but object scope absent |

### 6.9 Credential validation and handling procedure

Before executing functional cases:

1. Authenticate every enabled human account and record the returned `user_id`, `tenant_id`, role names, capability grants and object scopes.
2. Assert that P43 cannot use interactive user login and P44 cannot call user endpoints.
3. Assert that P45 receives no authenticated token.
4. Confirm disabled, expired-grant, role-without-grant and wrong-scope behavior independently; successful authentication must not be mistaken for successful authorization.
5. Verify each conflict account holds both intended capabilities, performs the first action, and is then denied the protected second action because the actor IDs match.
6. Never place access tokens, refresh tokens, mTLS private keys or generated secrets in screenshots, defect tickets or test reports.
7. Reset disposable environment passwords after external UAT and destroy all generated device/OAuth credentials at test-environment teardown.

The test runner should reference personas by `Pxx` or `Cxx`, resolve credentials from the environment, and redact the password in output. Recommended variables use this form:

```text
DOFA_QA_P01_EMAIL
DOFA_QA_P01_PASSWORD
DOFA_QA_C01_EMAIL
DOFA_QA_C01_PASSWORD
DOFA_QA_P43_CLIENT_ID
DOFA_QA_P43_CLIENT_SECRET
DOFA_QA_P44_CERT_PATH
DOFA_QA_P44_KEY_PATH
```

---

## 7. Test data model

### 7.1 Tenant/scope topology

Create:

- Tenant A and Tenant B.
- Two campuses per tenant.
- Two departments per campus.
- Two laboratories and two projects per department.
- Two stores locations and at least two gate locations.
- Same display names across tenants to detect scope mistakes.

### 7.2 Product and procurement matrix

| Dataset | Characteristics |
|---|---|
| D01 Laptop | high-value, serialized, RFID required, data-bearing |
| D02 Server | very high value, multi-level DoFA, data-bearing |
| D03 Keyboard | low-value ITEM, signed label but RFID optional |
| D04 Furniture | non-serialized asset, location/custody tracking |
| D05 Gloves | non-expiring consumable LOT |
| D06 Reagent | expiring/hazardous consumable LOT with FEFO |
| D07 Installation | service acceptance, no physical inventory identity |
| D08 Software license | digital entitlement, no Module 4 case |
| D09 Personal-account purchase | mandatory Module 3 human certification |
| D10 Multi-vendor acquisition | split orders and partial deliveries |
| D11 DOA unit | return/replacement lineage |
| D12 Repairable asset | warranty/parts/re-verification path |
| D13 Irreparable laptop | sanitization and Module 9 disposal |

### 7.3 Boundary values

Include ₹0, ₹0.01, ₹499.99, ₹500, ₹500.01, exact DoFA limits, one paise above limits, maximum supported values, quantity 0/1/500/501, decimal quantities where valid, leap dates, expiry boundaries, Unicode, long text, duplicate invoice numbers, duplicate manufacturer serials, invalid URLs and mixed currencies.

### 7.4 Immutable baseline

Publish a manifest containing all seed IDs and hashes. Tests must never depend on unknown pre-existing records. Every destructive test runs inside a disposable tenant or database.

---

## 8. Test-case specification standard

Every case uses this format:

```text
Test ID:
Requirement / invariant:
Module(s):
Risk level: Critical | High | Medium | Low
Test type: Unit | API | DB | Integration | UI | Hardware | Security | Performance | UAT
Persona and account ID:
Credential registry ID and login ID:
Tenant/scope:
Policy/feature-flag versions:
Preconditions and seed IDs:
Input and idempotency key:
Steps:
Expected API/UI result:
Expected database result:
Expected ledger/quantity result:
Expected event/outbox result:
Expected audit result:
Expected downstream result:
Cleanup/recovery:
Evidence links:
Actual result:
Pass/Fail:
Defect ID:
Tester and timestamp:
```

Critical cases must include API, database and event evidence; screenshots alone are insufficient.

---

## 9. Module execution matrices

The detailed functional cases in the source QA plan remain required. The following matrix adds persona, negative and evidence expectations.

### 9.1 Module 1 — Acquisition

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| M1-001 | Create/edit draft with multiple lines | P01 | draft revision increments; totals server-calculated |
| M1-002 | Submit and hash immutable snapshot | P01 | `VALIDATED` path, canonical hash, mutation denied |
| M1-003 | Amend submitted request | P01 | stable acquisition ID/number; new version ID/reservation |
| M1-004 | Vendor scoring and hard gates | P03 | stored raw inputs, policy version and reproducible score |
| M1-005 | Select non-recommended vendor | P03/P04 | justification + exception; independent authority where configured |
| M1-006 | Concurrent budget reservation | P05 | one valid result; allocation never negative |
| M1-007 | DoFA route and decisions | P09/P10/P11 | pinned route, distinct users, hash-linked decisions |
| M1-008 | Self/out-of-scope approval | P01/P09 from wrong scope | denied with no decision row |
| M1-009 | Excel preview/atomic commit | P01 | row errors; single-use token; zero partial rows |
| M1-010 | IRMS retry and changed replay | P43 | identical retry same result; changed retry `409` |
| M1-011 | Withdraw/reject/expire | P01/approver/worker | reservation released exactly once |
| M1-012 | Approved event | system | one complete `AcquisitionApproved.v1` outbox event |

### 9.2 Module 2 — Progressive procurement

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| M2-001 | Consume approved acquisition | system | exact-once case creation and source-hash validation |
| M2-002 | Split/partial orders | P03/P04 | active ordered quantity never exceeds approved quantity |
| M2-003 | Partial and rejected receipts | P12 | accepted quantity only becomes downstream eligible |
| M2-004 | Receipt maker-checker | P03 then same P03 | receipt denied |
| M2-005 | Invoice entry/correction/void | P06 | revision history; finalized record not overwritten |
| M2-006 | Three-way match tolerances | P07 | pinned policy and reproducible dimensions |
| M2-007 | Payment eligibility | P08 | current match + current Module 3 clearance + balance |
| M2-008 | Financial bucket transitions | P03/P08 | allocation conservation after each action |
| M2-009 | Concurrent order/payment/refund | P03/P08 | locks prevent double counting/overspend |
| M2-010 | Return/credit/refund | Module 7 + P08 | financial recovery posted once |
| M2-011 | Item-type finalization | system | asset/consumable/service gates differ correctly |
| M2-012 | Legacy bypass attempt | legacy user/API | Module-2-managed row rejects write |

### 9.3 Module 3 — Invoice integrity

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| M3-001 | Institutional source exact match | connector/system | immutable snapshot and source identity |
| M3-002 | Hard identity/currency/vendor blocker | system/P07 | blocker overrides low numerical risk |
| M3-003 | Unavailable factor | system | coverage/confidence fall; risk not lowered |
| M3-004 | Offline/personal invoice | investigator + certifier | two distinct human identities required |
| M3-005 | Evidence alteration/reuse | attacker persona | hash rejection; original preserved |
| M3-006 | AI outage/malformed/prompt injection | system | manual/deterministic path; no authoritative decision |
| M3-007 | Evidence-set certification | investigator/certifier | exact document revision and evidence-set hash |
| M3-008 | Invoice revision after clearance | P06 | old case superseded; payment eligibility removed |
| M3-009 | Maker-checker combinations | P06/P07/certifier/P08 | prohibited pairings denied |
| M3-010 | Payment projection | system | only current clearance emitted/projected |

### 9.4 Module 4 — Physical verification

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| M4-001 | ITEM generation for identical units | P12/system | one immutable subject per accepted unit |
| M4-002 | LOT generation/conservation | P12 | subject quantities within net accepted quantity |
| M4-003 | Trusted capture/nonce/views | P14 | missing/replayed/wrong session rejected |
| M4-004 | Geofence boundary/accuracy | P14/P16 | deterministic result and restricted exception |
| M4-005 | Attribute outcomes | system/P15 | MATCHED/MISMATCHED/UNKNOWN/N/A preserved |
| M4-006 | Automated-clearance gate | system | all mandatory conditions and no blocker |
| M4-007 | Material substitution exception | P16 | prohibited; amendment/return route required |
| M4-008 | Stale Module 3 clearance | system | subject cannot clear |
| M4-009 | Identity signing/revocation | system | server scan changes to revoked/superseded |
| M4-010 | Capturer/reviewer separation | P14/P15 | same-user review denied |

### 9.5 Module 5 — Universal inventory

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| M5-001 | ITEM identity allocation | P17 + verifier | one UUID and unique Asset ID |
| M5-002 | LOT identity/initial movement | P17 | one lot ID and reproducible quantity |
| M5-003 | Concurrent code allocation | parallel P17 | no duplicate Asset/Lot/RFID IDs |
| M5-004 | Manufacturer serial collision | P17 | activation blocked; discrepancy created |
| M5-005 | Ownership/custody/location | authorized actors | independent history and values |
| M5-006 | Atomic LOT transfer | inventory operator | both movement sides commit or neither |
| M5-007 | Module 4 revocation | system | record quarantined and scan invalid |
| M5-008 | Identity revision | discrepancy approver | permanent identity retained unless proven wrong |
| M5-009 | Legacy reconciliation | P39/admin | potential match never auto-merges |
| M5-010 | Public scan minimization | P45 | no sensitive fields; live status checked |

### 9.6 Module X — Physical identity and gates

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| MX-001 | Signed one-time job | Module 5/P18 | kiosk cannot supply identity fields |
| MX-002 | Expiry/replay/stale revision | P18/P44 | fail closed and one historical job |
| MX-003 | Device registration/attestation | P40/P44 | mTLS fingerprint, key and firmware validation |
| MX-004 | RFID-required provisioning | P18/P19 | encode, print, attach, distinct verification |
| MX-005 | Label-only provisioning | P18/P19 | signed QR/Code128 without invented RFID |
| MX-006 | Wrong-asset attachment | P19 | verification rejected; Module 5 not activated |
| MX-007 | Lost tag/rebinding | P18/P19 | same logical RFID, old binding revoked |
| MX-008 | Gate permit match | P20/P44 | upstream permit produces authorized passage |
| MX-009 | Missing/stale/wrong permit | P20/P44 | `REVIEW_REQUIRED`, never theft |
| MX-010 | Offline cache and sequence | P44 | <= policy window accepted; stale/gap/replay reviewed |
| MX-011 | Public signed QR | P45 | signature + current Module 5 status |
| MX-012 | Cross-device/gate submission | compromised P44 | rejected and audited |

### 9.7 Module 6 — Consumables

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| M6-001 | Request and approval-time FEFO allocation | P21/P22 | exact LOT allocations under locks |
| M6-002 | Concurrent reservation | parallel P22 | active allocations never exceed eligibility |
| M6-003 | Reservation expiry worker | worker | release once without dashboard access |
| M6-004 | Partial issue | P23 | reservation consumption exact by LOT |
| M6-005 | Consumption vs return | P21/custodian | issued custody reconstructs without double subtraction |
| M6-006 | Expired/quarantined LOT | P22/P23 | cannot reserve or issue |
| M6-007 | Emergency issue/review | issuer/reviewer | immutable movement; independent review within SLA |
| M6-008 | Blind physical count | P24/P25 | hidden expected value and independent adjustment |
| M6-009 | Stale count | P24/P25 | concurrent movement forces review/recount |
| M6-010 | Replenishment conversion | authorized requester | one Module 1 draft; no approval/budget bypass |

### 9.8 Module 7 — Return/DOA

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| M7-001 | DOA/standard eligibility | P26/P27 | pinned policy, server submission window |
| M7-002 | Exact ITEM allocation | parallel P26 | maximum one active case |
| M7-003 | Partial LOT allocation | parallel P26 | holds + returns within eligible quantity |
| M7-004 | Return hold | system/Module 5 | inventory unchanged but conflicting operations blocked |
| M7-005 | Rejection/cancellation | P27/P28 | hold released via append-only state |
| M7-006 | Shipment | P13 | inventory/LOT changes only on actual execution |
| M7-007 | Replacement unit | system | new subject, UUID, Asset ID and RFID |
| M7-008 | Repaired original | system | same Asset ID with new verification/identity revision |
| M7-009 | Superseded decision | P28/system | pending Module 2 command rejected |
| M7-010 | Recovery conservation | P08 | only posted recovery affects financial state |

### 9.9 Module 8 — Service/warranty

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| M8-001 | Service request and hold | P29/system | conflicting operations blocked |
| M8-002 | Concurrent service execution | parallel service desk | one controlling execution |
| M8-003 | Warranty precedence | reviewer | historical terms remain pinned |
| M8-004 | External vendor custody | P30/P31 | normal custody/location changes blocked |
| M8-005 | Chargeable work | P30/P03 | cannot start before Module 1/2 authority |
| M8-006 | Parts routing | P30/P13 | Module 6 or Modules 1–5 path used correctly |
| M8-007 | Estimate overrun | P30 | amendment required before work |
| M8-008 | Material repair | P30/system | Module 4 re-verification required |
| M8-009 | Independent acceptance | P31 | technician/provider cannot accept own work |
| M8-010 | Irreparable/unsafe | system | quarantine + Module 9 referral; no disposal |

### 9.10 Module 9 — Retirement/disposal

| ID | Scenario | Persona(s) | Expected proof |
|---|---|---|---|
| M9-001 | Retirement hold guard | P32/system | Module 5/7/8/legacy conflicting mutations denied |
| M9-002 | Assessment blockers | P33 | DoFA blocked until valuation/legal/environment/data complete |
| M9-003 | Approval basis and route | P09–P11 | max basis calculation and pinned ASSET_WRITEOFF route |
| M9-004 | Sanitization | P34/P35 | distinct users and verifiable evidence |
| M9-005 | Sealed bid/award | P36/P37 | immutable sealed offers; conflict rules |
| M9-006 | Below-reserve award | P37 | amendment and reapproval required |
| M9-007 | Partial pickup | P38 | only exact scanned assets transferred |
| M9-008 | Finance failure after physical completion | Finance/system | visible reconciliation state; no closure |
| M9-009 | Finance before physical completion | Finance/system | controlled retirement custody; no closure |
| M9-010 | Completion certificate | system | every physical, Finance and sanitization gate satisfied |
| M9-011 | Certificate supersession | authorized authority | original immutable; current online status changes |
| M9-012 | Identity non-reuse | system | disposed UUID/Asset/RFID never reassigned |

---

## 10. Cross-module persona journeys

Each journey must be executed with the named distinct accounts and include a deliberate denied action.

### J01 — Normal RFID asset purchase

```text
P01 request → P03 vendor/order → P05 budget → P09/P10 DoFA
→ P12 receipt → P06 invoice → P07 match
→ Module 3 investigator/certifier → P08 payment
→ P14 capture → P15 review → P17 inventory preparation
→ P18 encode/attach → P19 verify → Module 5 activation
```

Denied checks: P01 approval, P03 receipt, P06 invoice verification, P18 attachment verification.

### J02 — Label-only low-value asset

Use D03 below the tenant RFID threshold. Confirm signed QR and Code128 provisioning, no logical/physical RFID invention, independent attachment verification and valid public-safe scan.

### J03 — Consumable acquisition and replenishment

```text
Modules 1–5 LOT creation → P21 request → P22 FEFO reservation
→ P23 issue → P21 consumption/internal return → alert/suggestion
→ authorized conversion creates Module 1 DRAFT only
```

### J04 — DOA replacement

```text
P26 submit exact ITEM → P27 eligibility → P28 disposition
→ Module 2 return/financial execution → replacement receipt
→ Module 4 new subject → Module 5 new identity → Module X new tag
```

Prove lineage to the old asset and zero identity reuse.

### J05 — Repaired original

```text
Module 7 repair referral → P30 repair → Module 4 re-verification
→ Module 5 identity revision/tag action → P31 acceptance
```

Prove University Asset ID is preserved.

### J06 — External service gate passage

Module 8 vendor-custody permit must authorize only the exact asset, direction, gate and validity window. P20 sees `AUTHORIZED_PASSAGE`. Repeat at wrong gate and after expiry; expect `REVIEW_REQUIRED`.

### J07 — Irreparable data-bearing retirement

```text
Module 8 unsafe outcome → P32 request → P33 assessment
→ DoFA → P34 sanitization → P35 verification
→ P36/P37 disposal → P38 handover → Finance posting
→ certificate and Module 5 DISPOSED
```

### J08 — Cross-tenant adversarial journey

For every object in J01, replace its ID in a Tenant B user's request. Verify no existence, metadata, signed URL, event or timing leak.

### J09 — Correction/revocation propagation

Correct an invoice after Module 3 clearance, revoke a Module 4 identity after Module 5 activation, supersede a Module 7 decision and reconsider a Module 9 certificate. Confirm each downstream projection becomes stale/blocked without deleting history.

### J10 — Feature-flag rollback

Enable one module for a pilot scope, create open and finalized records, disable the flag, and prove:

- new gated work is blocked;
- existing history remains readable to authorized users;
- workers do not create unauthorized new effects;
- legacy records remain operational;
- re-enable resumes safely without duplication.

---

## 11. Authorization and security matrix

### 11.1 Required attack classes

- horizontal/vertical privilege escalation;
- cross-tenant, department, project, laboratory, location and object IDOR;
- JWT alteration, expired grants, confused-deputy service identities;
- OAuth audience/scope misuse and mTLS certificate mismatch;
- replayed idempotency keys, device sequences, capture nonces and callbacks;
- CSRF where cookies are used, XSS, SQL injection, SSRF and malicious URLs;
- path traversal, object-key guessing, expired signed downloads;
- formula/macro/external-link spreadsheet attacks;
- PDF/image malware and decompression bombs;
- forged events, hashes, signatures and source snapshots;
- document/image prompt injection and private-data exfiltration to AI;
- rate-limit and lockout bypass;
- public scan enumeration and sensitive-field leakage.

### 11.2 Security acceptance

- Any cross-tenant read/write is S0 and blocks release.
- Any approval/payment/identity/disposal bypass is S0 or S1 and blocks release.
- Security logs must avoid secrets, OTPs, cookies, connector payloads and personal-account data.
- Error messages must not reveal whether an out-of-scope UUID exists.

---

## 12. Concurrency and transaction tests

Run with synchronized parallel clients and repeat at least 100 times for critical races:

| ID | Race | Required result |
|---|---|---|
| CON-01 | competing budget reservations | no overspend |
| CON-02 | order issues against same envelope | quantity/value within approval |
| CON-03 | payments/refunds on same invoice | one valid ledger effect |
| CON-04 | accepted receipts against same order | no unapproved over-receipt |
| CON-05 | Module 4 subject creation | exact count, no duplicate subjects |
| CON-06 | Asset/Lot/RFID code generation | unique monotonically allocated identities |
| CON-07 | LOT transfer | both sides commit or neither |
| CON-08 | consumable reservations | no oversubscription |
| CON-09 | return ITEM/LOT holds | one ITEM case; conserved LOT quantity |
| CON-10 | service cases | one active execution per asset |
| CON-11 | retirement cases | one active allocation per identity |
| CON-12 | Module X claim/tag binding | one claimant and one active tag identity |
| CON-13 | DoFA decisions | no duplicate/replayed signature |
| CON-14 | physical count and stock movement | stale-count review, no silent overwrite |

Collect transaction IDs, response codes, row locks, final rows, ledger totals and event counts.

---

## 13. Event, worker and recovery testing

For every published event exercise normal, duplicate, delayed, reversed-order, sequence-gap, malformed-hash, wrong-tenant and unsupported-version delivery.

Test consumer crashes:

1. before domain commit;
2. after domain commit but before checkpoint;
3. after checkpoint but before acknowledgement;
4. during outbox publication;
5. during snapshot recovery.

Expected:

- one business effect;
- monotonic aggregate sequence;
- duplicate event ID retained/ignored safely;
- visible retry/dead-letter state;
- no newer projection overwritten by an older event;
- recovery without manual database edits.

Workers requiring time-control tests include budget expiry, reservation expiry, policy activation, capture/job expiry, preventive scheduling, alert state, source retrieval retry and Finance reconciliation retry.

---

## 14. Failure and chaos testing

Inject failures at every external boundary and immediately before/after commit:

- database disconnect/deadlock/statement timeout;
- Redis/cache outage;
- object upload succeeds but DB fails, and the reverse;
- queue broker unavailable/backlogged;
- IRMS or Falcon callback outage;
- OAuth/mTLS token/certificate expiry;
- vendor/source connector timeout/schema drift;
- AI timeout/malformed response;
- printer jam, RFID encoding failure and device power loss;
- gate reader offline within and beyond cache window;
- Finance/GL failure before/after physical disposition.

For each injection verify atomicity, user-visible state, idempotent recovery, orphan cleanup/reconciliation, audit evidence and alerting.

---

## 15. Performance, capacity and soak testing

Before UAT, publish agreed SLOs. At minimum measure P50/P95/P99, error rate, database saturation, queue lag and worker recovery for:

- acquisition and approval queues;
- procurement/funds dashboard;
- universal inventory search and scan;
- consumable balance/reservation;
- audit/provenance timeline;
- public QR/RFID lookup;
- gate batch ingestion and permit lookup;
- Excel preview/commit;
- invoice analysis and evidence processing;
- image/video capture processing;
- outbox/consumer throughput.

Execute 100, 500 and 1,000 concurrent-user profiles, burst gate traffic, a 24-hour soak, backlog catch-up and database failover/restart. No test passes merely because average latency is acceptable; P95/P99 and correctness under load are required.

---

## 16. Accessibility, compatibility and usability

Validate:

- keyboard-only navigation and visible focus;
- labels and error association;
- screen-reader announcements for workflow/error/status changes;
- contrast and non-colour-only status meaning;
- responsive layouts at supported breakpoints;
- current supported Chrome, Edge, Safari and PWA modes;
- camera/location permission denied, revoked and restored;
- large grids, long names, Unicode and slow network behavior;
- no sensitive details in notifications or public views.

Critical business actions require confirmation, clear effect text and recovery instructions.

---

## 17. Audit and reconciliation

For randomly sampled acquisitions, assets, LOTs, invoices and retirement cases, an auditor must reconstruct the complete chain from immutable facts without relying on screenshots.

Required reconciliation jobs:

- Module 1 reservation versus approved amount;
- Module 2 allocation bucket conservation;
- Module 2 invoice/payment/credit/refund totals;
- Module 4 subjects versus net accepted quantity;
- Module 5 ITEM uniqueness and LOT movement balance;
- Module 6 issued custody and active reservations;
- Module 7 holds, executed returns and posted recovery;
- Module 8 parts, service cost and asset custody;
- Module 9 manifest, physical status and Finance status;
- Module X jobs, tag bindings, permits and gate observations;
- canonical domain versus legacy projections.

Any unexplained reconciliation difference is at least S1.

---

## 18. Automation and CI pipeline

### 18.1 Pull-request gate

- formatting/diff check;
- strict lint;
- type checking/build;
- unit, policy, hash and calculation tests;
- migration contract tests;
- API authorization tests for changed modules;
- affected upstream/downstream contract tests.

### 18.2 Main-branch gate

- clean database migration replay;
- all Modules 1–9 + X backend/frontend regression;
- event contract compatibility;
- one-way legacy projection tests;
- generated API/schema compatibility report.

### 18.3 Nightly

- database-backed concurrency tests;
- event retry/gap suite;
- malware/parser corpus;
- cross-tenant IDOR matrix;
- worker/expiry tests with controlled time;
- reconciliation reports.

### 18.4 Pre-release

- full E2E persona journeys;
- security scan/penetration results;
- performance and soak;
- backup/restore and disaster-recovery rehearsal;
- hardware matrix;
- UAT and audit reconstruction;
- feature-flag enable/disable rehearsal.

Flaky tests are defects. A quarantined critical test counts as not passed.

---

## 19. Traceability and reporting

Maintain a requirements traceability matrix:

```text
Requirement / invariant
→ test case IDs
→ automated suite/manual script
→ persona and scope
→ build and environment
→ evidence location
→ latest result
→ defect IDs
→ sign-off owner
```

Dashboard metrics must include:

- planned/executed/pass/fail/blocked by risk and module;
- persona positive/negative coverage;
- invariant coverage;
- requirements without tests;
- automation percentage;
- open defects by severity/age;
- flaky test rate;
- performance SLO results;
- reconciliation exceptions;
- UAT sign-off status.

---

## 20. Defect severity and release rules

| Severity | Definition | Release effect |
|---|---|---|
| S0 Critical | corruption, cross-tenant exposure, duplicate identity, financial/quantity loss, unrecoverable audit break | immediate stop; no release |
| S1 High | approval/payment/security bypass, incorrect balance, stale clearance accepted, hold bypass | no release |
| S2 Medium | material function defect with controlled workaround | formal risk acceptance required |
| S3 Low | minor usability/content issue | may defer with owner/date |

Security exposure, identity reuse, unauthorized payment, budget overspend, stock oversubscription and sanitization bypass are automatically S0/S1.

---

## 21. Module exit gate

A module baseline may be frozen only when:

- 100% critical and high-risk cases pass;
- all applicable INV and SOD cases pass;
- positive and negative persona coverage is complete;
- database concurrency and idempotency cases pass;
- event retry, gap and recovery cases pass;
- cross-module contracts pass;
- reconciliation difference is zero or formally explained;
- legacy compatibility passes;
- strict lint, type checking, builds and migrations pass;
- no S0/S1 defect is open;
- security and business UAT sign-offs are recorded.

Passing unit tests alone is not an exit gate.

---

## 22. Final production acceptance

Production activation requires all of the following:

1. Modules 1–9 + X cleanly migrate from the production baseline.
2. Full regression, E2E personas, security, performance, hardware and recovery suites pass.
3. Every role has both successful in-scope and denied out-of-scope evidence.
4. Maker-checker controls are proven with overlapping-role users.
5. Financial and quantity conservation are independently reproduced.
6. Every identity and certificate is signed, current-status checked and non-reusable.
7. No stale invoice, physical verification, return decision or permit authorizes downstream work.
8. No data-bearing asset leaves custody without verified sanitization/destruction.
9. Legacy APIs cannot mutate canonical records.
10. Observability, alert ownership, runbooks, backup/restore and rollback are approved.
11. All feature flags remain off until the signed go/no-go decision, then enable only the approved pilot scope.

### Final QA principle

For every business action, testers must ask:

- Can the same user improperly perform both sides?
- Can another tenant or department use this object ID?
- What happens when two users act simultaneously?
- What happens if the process crashes immediately before or after commit?
- Is retry safe, and does a changed retry conflict?
- Can original evidence or history be altered?
- Can totals be independently reconstructed?
- Can an older event overwrite newer state?
- Does correction, revocation, return or supersession invalidate downstream authority?
- Can a legacy endpoint or device bypass the canonical module?

The platform is production-ready only when repeatable evidence answers every applicable question.
