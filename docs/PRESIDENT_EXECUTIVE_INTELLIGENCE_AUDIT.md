# Executive Intelligence Audit — Phase F.4

Unified decision-context API does **not** exist. Context is per-domain list payloads.

## Context Field Coverage

| Budget — request_owner | WARN | no pending budget in inbox |
| Budget — business_reason | WARN | no pending budget in inbox |
| Budget — previous_history | WARN | no pending budget in inbox |
| Budget — supporting_documents | WARN | no pending budget in inbox |
| Budget — department_impact | WARN | no pending budget in inbox |
| Budget — financial_impact | WARN | no pending budget in inbox |
| Budget — academic_impact | WARN | no pending budget in inbox |
| Budget — risk_level | WARN | no pending budget in inbox |
| Budget — recommendation | WARN | no pending budget in inbox |
| Budget — final_outcome | WARN | no pending budget in inbox |
| HR — request_owner | WARN | no pending HR row |
| HR — business_reason | WARN | no pending HR row |
| HR — previous_history | WARN | no pending HR row |
| HR — supporting_documents | WARN | no pending HR row |
| HR — department_impact | WARN | no pending HR row |
| HR — financial_impact | WARN | no pending HR row |
| HR — academic_impact | WARN | no pending HR row |
| HR — risk_level | WARN | no pending HR row |
| HR — recommendation | WARN | no pending HR row |
| HR — final_outcome | WARN | no pending HR row |
| Executive Orders — business_reason | PASS | subject only |
| Executive Orders — request_owner | WARN | issuer not in list payload |
| Executive Orders — final_outcome | PASS | ISSUED |
| Compliance — department_impact | PASS | — |
| Compliance — risk_level | WARN | no explicit risk score |
| Convocation — request_owner | WARN | registrar verifier not exposed |
| Convocation — academic_impact | WARN | — |
| Grievance — business_reason | PASS | — |
| Grievance — department_impact | PASS | — |
| Grievance — risk_level | PASS | SLA breach signal |
| Meetings — action context | WARN | no President GET for action-item detail bundle |

## Summary

- **Present:** HR requester (F.4 fix), budget inbox reason/amount, grievance SLA/dept, convocation program
- **Missing (WARN):** Previous history, supporting documents, explicit risk scores, recommendations, registrar verifier on convocation, meeting action bundles

See `PRESIDENT_DECISION_CONTEXT_REPORT.md` for remediation guidance.
