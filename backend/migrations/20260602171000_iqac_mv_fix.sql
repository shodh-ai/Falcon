-- Fix IQAC materialized views when optional tables are missing

DROP MATERIALIZED VIEW IF EXISTS iqac_mv_placement_stats;
CREATE MATERIALIZED VIEW iqac_mv_placement_stats AS
SELECT
  u.tenant_id,
  COALESCE(d.dept_name, 'University-wide') AS dept_name,
  COUNT(DISTINCT pja.student_user_id) FILTER (WHERE pja.status IN ('ACCEPTED', 'OFFERED'))::int AS total_placed,
  ROUND(AVG(jp.ctc_lpa)::numeric, 2) AS average_package,
  ROUND(MAX(jp.ctc_lpa)::numeric, 2) AS highest_package
FROM placement_job_applications pja
JOIN placement_job_postings jp ON jp.job_id = pja.job_id
JOIN users u ON u.user_id = pja.student_user_id
LEFT JOIN departments d ON d.dept_id = u.dept_id
WHERE jp.ctc_lpa IS NOT NULL
GROUP BY u.tenant_id, d.dept_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_iqac_mv_placement_stats
  ON iqac_mv_placement_stats(tenant_id, dept_name);

DROP MATERIALIZED VIEW IF EXISTS iqac_mv_faculty_metrics;
CREATE MATERIALIZED VIEW iqac_mv_faculty_metrics AS
SELECT
  u.tenant_id,
  COUNT(*) FILTER (WHERE r.role_name IN ('Faculty', 'HOD', 'Dean'))::int AS total_faculty,
  COUNT(*) FILTER (
    WHERE r.role_name IN ('Faculty', 'HOD', 'Dean')
      AND (hp.designation ILIKE '%phd%' OR hp.designation ILIKE '%doctor%')
  )::int AS phd_faculty,
  0::numeric(14, 2) AS total_research_grants
FROM users u
JOIN roles r ON r.role_id = u.role_id
LEFT JOIN hr_employee_profiles hp ON hp.user_id = u.user_id AND hp.tenant_id = u.tenant_id
WHERE u.is_active = true
GROUP BY u.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_iqac_mv_faculty_metrics ON iqac_mv_faculty_metrics(tenant_id);

REFRESH MATERIALIZED VIEW iqac_mv_placement_stats;
REFRESH MATERIALIZED VIEW iqac_mv_faculty_metrics;
