-- Earlier revaluation demand creation omitted tenant ownership. Resolve only
-- demands linked to an application whose student/tenant identity is consistent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM exam_applications a
    JOIN finance_fee_demands d ON d.demand_id = a.finance_demand_id
    JOIN users u ON u.user_id = a.student_user_id
    WHERE a.application_type = 'RE_EVALUATION'
      AND (d.student_user_id != a.student_user_id
        OR u.tenant_id IS DISTINCT FROM a.tenant_id
        OR (d.tenant_id IS NOT NULL AND d.tenant_id != a.tenant_id))
  ) THEN
    RAISE EXCEPTION 'Cannot backfill revaluation fee tenant: application/demand ownership mismatch';
  END IF;
END $$;

UPDATE finance_fee_demands d
SET tenant_id = a.tenant_id
FROM exam_applications a
JOIN users u ON u.user_id = a.student_user_id AND u.tenant_id = a.tenant_id
WHERE a.application_type = 'RE_EVALUATION'
  AND a.finance_demand_id = d.demand_id
  AND d.student_user_id = a.student_user_id
  AND d.tenant_id IS NULL;
