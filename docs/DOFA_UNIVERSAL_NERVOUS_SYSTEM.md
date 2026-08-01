# DOFA — The University Nervous System

> **Audience:** Dr. Sudhanshu (Chairman) and leadership.  
> **One-liner:** *You steer; the software is the bad guy that enforces the rules.*

## DOFA is not a product you buy

**Delegation of Financial / Functional Authority (DOFA)** is not a 13th Falcon app.  
It is the **middle layer** of the University Operating System — invisible gatekeeper logic behind every click.

Think traffic lights, not a new road. You program DOFA rules into Falcon; every domain (P2P, HR, SIS, ESM, RMS, ALM) asks the same brain: *“Who may say yes to this?”*

## The layered cake

```text
┌─────────────────────────────────────────────────────────────┐
│  TOP — Dashboards (Viewers)                                 │
│  Chairman · VC · External Auditors                          │
│  Executive BI only. Daily approvals do NOT land here.       │
├─────────────────────────────────────────────────────────────┤
│  MIDDLE — Universal DOFA Engine (Gatekeeper)                │
│  Pure code + matrices. Routes to Deans / COO / CFO / HODs.  │
│  Escalates Exceptions only (₹20L+, budget 0%, SLA 10d…).    │
├─────────────────────────────────────────────────────────────┤
│  BOTTOM — Functional Systems (Workers)                      │
│  P2P · HRMS · SIS · LMS · ESM · RMS · ALM · Space           │
│  Students, faculty, labs, security generate the requests.   │
└─────────────────────────────────────────────────────────────┘
```

## The universal 4-step loop

1. **Trigger** — A human asks for something in a domain app.  
2. **DOFA intercept** — Engine looks up the matrix for domain + amount + rule key.  
3. **Routing** — Notify only authorized roles (never spam the Chairman).  
4. **Execution** — On final approval, the domain system performs the action.

### Examples

| Domain | Trigger | Matrix rule | Who sees it |
|--------|---------|-------------|-------------|
| P2P | ₹85k lab equipment | L1/L2/L3 via `fin_dofa_levels` | Lab / Procurement / Finance — not Chairman |
| HR hire | Assistant Professor ₹12L CTC | Dean + HR + CFO (&lt; ₹15L) | Not VC/Chairman |
| SIS grade | C → B after publish | HOD + COE | Student portal updates only after both sign |
| ALM write-off | Scrap heavy asset | COO + CFO | Bus cannot leave until both approve |
| ESM | Ticket open &gt; 10 days | Exception → Chairman | Management by Exception |

## Management by Exception

Today leadership often **manages by intervention**. With DOFA in everything, the university **runs itself**. The Chairman only gets a ping when rules fail:

- Spend above COO limit (e.g. ₹20L)
- Department budget at 0%
- ESM SLA breached 10+ days

 falcon surfaces these on **`/leadership/exceptions`**.

## Falcon module → DOFA domain map

| Falcon area | DOFA domain key | Engine / matrix |
|-------------|-----------------|-----------------|
| Digital DOFA P2P | `P2P` | Existing `fin_dofa_levels` + projection into unified inbox |
| Headcount hire | `HR_HIRE` | `dofa_matrices` CTC bands |
| Grade change | `GRADE_CHANGE` | HOD + ExamCell/COE |
| Asset write-off | `ASSET_WRITEOFF` | COO + CFO |
| Helpdesk SLA | `ESM_EXCEPTION` | Escalate Chairman |
| MOU / Space | `MOU` / `SPACE` | Domain adapters (can migrate fully later) |

## APIs & UI

- Engine: `GET/POST /api/dofa/*` (cases, inbox, decide, exceptions)
- Unified inbox: `/approvals/dofa-inbox`
- Chairman exceptions: `/leadership/exceptions`
- P2P limits (read-only live matrix): `/finance/dofa`
- **Policy Vault (who holds the pen):** `/admin/dofa-policy-vault` + `/api/dofa/policy/*`

## Where the constitution lives / Who holds the pen

DOFA rules are not “settings any IT person can tweak.” They live in the **Policy Vault** — a dual-key Workflow Engine.

> We are not surrendering control to a machine. We take the rules you hold in your head, translate them into undeniable logic, and lock them in a vault. You dictate change at the board; the software executes without a paper chase.

### Dual-key change process

1. **Proposal** — Lab / Dean writes a memo; Finance Committee records minutes.
2. **IT drafts** — CampusAdmin / SuperAdmin (IT Head) opens the visual IF/THEN board, edits amount bands / signature chains, attaches `minutes_ref` + memo. Status = `DRAFT`.
3. **Freeze** — Submit → `PENDING_CFO`. Edits locked. Live matrices unchanged.
4. **CFO unlock** — CFO requests OTP and unlocks (SoD: unlocker ≠ proposer). Only then may the change publish.
5. **Publish** — Writes live `dofa_matrices` / `fin_dofa_levels`. Prior published graph → `SUPERSEDED`.
6. **Audit stone** — Append-only `dofa_policy_audit` (DB blocks UPDATE/DELETE): *who changed what, authorized by whom*.

Random IT cannot raise ₹50k → ₹50L alone. Without the CFO’s second key, the vault refuses.

### Visual board (this wave)

IF [Document = Purchase Request] AND [Amount BETWEEN…] THEN [Require Signature: …] ELSE IF …

**Out of this wave:** Grant / Emergency / Probation dynamic `rule_key` routing (engine still uses `DEFAULT` + amount bands).

## Father pitch (30 seconds)

> “Twelve gears. DOFA is the oil. Middle management signs within coded limits. You only see Exceptions. The software enforces the bureaucracy so you don’t have to yell. If the law must change, the board votes — IT drafts, CFO unlocks, and the audit stone remembers forever.”
