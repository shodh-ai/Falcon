# Decision Context Report — Phase F.4

Required executive context fields: request_owner, business_reason, previous_history, supporting_documents, department_impact, financial_impact, academic_impact, risk_level, recommendation, final_outcome

## Domain Summary

| Domain | Owner | Reason | History | Docs | Dept | Financial | Academic | Risk | Recommend | Outcome |
|--------|-------|--------|---------|------|------|-----------|----------|------|-----------|---------|
| Budget | partial | ✅ | ❌ | ❌ | partial | ✅ | ❌ | ❌ | ❌ | via approve |
| HR | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | via task |
| Orders | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ status |
| Compliance | partial | partial | ❌ | ❌ | ✅ | ❌ | ❌ | partial | ❌ | via action |
| Convocation | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | partial | ❌ | ❌ | ratify |
| Grievance | partial | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ SLA | ❌ | ✅ |
| Meetings | ❌ | partial | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | tasks |

**Recommendation:** Future phase may add `GET /api/president/decisions/:id/context` without UI redesign.
