# KPI Validation — Phase F.4

| pending_hr_approvals | PASS | summary=0 source=0 |
| pending_convocation_ratifications | PASS | summary=0 source=0 |
| pending_budget_expansions | PASS | summary=0 source=0 |
| pending_executive_orders | PASS | summary=8 source=8 |
| total_university_revenue | PASS | summary=499000 source=499000 |
| KPI last_refresh | WARN | no explicit timestamp field on executive-summary |

## Fixes Applied (F.4)

- `pending_governance_tasks` now tenant-scoped
- `finance-budget` uses `fin_dept_budgets` + `pending_budget_expansions`
- HR approvals expose `requested_by` and `financial_impact`
