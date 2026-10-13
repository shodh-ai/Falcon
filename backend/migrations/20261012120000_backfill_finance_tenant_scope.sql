-- Historical Finance rows were written by legacy ORM paths that did not
-- persist tenant_id. Recover only rows whose ownership is unambiguous.
-- New API reads fail closed for rows that still cannot be attributed.

UPDATE finance_fee_demands d
SET tenant_id = u.tenant_id
FROM users u
WHERE d.student_user_id = u.user_id
  AND d.tenant_id IS NULL
  AND u.tenant_id IS NOT NULL;

UPDATE finance_transactions t
SET tenant_id = d.tenant_id
FROM finance_fee_demands d
WHERE t.demand_id = d.demand_id
  AND t.tenant_id IS NULL
  AND d.tenant_id IS NOT NULL;

UPDATE finance_transactions t
SET tenant_id = u.tenant_id
FROM users u
WHERE t.student_user_id = u.user_id
  AND t.tenant_id IS NULL
  AND u.tenant_id IS NOT NULL;
