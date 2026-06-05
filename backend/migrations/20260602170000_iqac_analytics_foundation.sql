-- IQAC Central Monitoring: document repository, report jobs, materialized views

CREATE TABLE IF NOT EXISTS iqac_document_repository (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  naac_criterion INT NOT NULL CHECK (naac_criterion BETWEEN 1 AND 7),
  metric_number VARCHAR(10),
  title VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  academic_year VARCHAR(9) NOT NULL DEFAULT '2025-2026',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iqac_repo_criterion ON iqac_document_repository(tenant_id, naac_criterion, academic_year);

CREATE TABLE IF NOT EXISTS iqac_report_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('AQAR', 'SSR')),
  academic_year VARCHAR(9) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  output_path TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

DROP MATERIALIZED VIEW IF EXISTS iqac_mv_placement_stats;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'placement_applications' AND column_name = 'jd_id'
  ) THEN
    EXECUTE $mv$
      CREATE MATERIALIZED VIEW iqac_mv_placement_stats AS
      SELECT
        pa.tenant_id,
        COALESCE(d.dept_name, 'University-wide') AS dept_name,
        COUNT(DISTINCT pa.student_user_id)::int AS total_placed,
        ROUND(AVG(jd.package_lpa)::numeric, 2) AS average_package,
        ROUND(MAX(jd.package_lpa)::numeric, 2) AS highest_package
      FROM placement_applications pa
      JOIN placement_job_descriptions jd ON jd.jd_id = pa.jd_id
      JOIN users u ON u.user_id = pa.student_user_id
      LEFT JOIN departments d ON d.dept_id = u.dept_id
      WHERE jd.package_lpa IS NOT NULL
      GROUP BY pa.tenant_id, d.dept_name
    $mv$;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'placement_job_applications'
  ) THEN
    EXECUTE $mv$
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
      GROUP BY u.tenant_id, d.dept_name
    $mv$;
  ELSE
    EXECUTE $mv$
      CREATE MATERIALIZED VIEW iqac_mv_placement_stats AS
      SELECT
        t.tenant_id,
        'University-wide'::varchar AS dept_name,
        0::int AS total_placed,
        0::numeric AS average_package,
        0::numeric AS highest_package
      FROM tenants t
      WHERE false
    $mv$;
  END IF;
END $$;

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
  0::numeric(14,2) AS total_research_grants
FROM users u
JOIN roles r ON r.role_id = u.role_id
LEFT JOIN hr_employee_profiles hp ON hp.user_id = u.user_id AND hp.tenant_id = u.tenant_id
WHERE u.is_active = true
GROUP BY u.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_iqac_mv_faculty_metrics ON iqac_mv_faculty_metrics(tenant_id);

DROP MATERIALIZED VIEW IF EXISTS iqac_mv_student_counts;
CREATE MATERIALIZED VIEW iqac_mv_student_counts AS
SELECT
  u.tenant_id,
  COUNT(DISTINCT u.user_id)::int AS total_students
FROM users u
JOIN roles r ON r.role_id = u.role_id
WHERE r.role_name = 'Student' AND u.is_active = true
GROUP BY u.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_iqac_mv_student_counts ON iqac_mv_student_counts(tenant_id);

DROP MATERIALIZED VIEW IF EXISTS iqac_mv_repository_health;
CREATE MATERIALIZED VIEW iqac_mv_repository_health AS
SELECT
  tenant_id,
  naac_criterion,
  academic_year,
  COUNT(*)::int AS document_count
FROM iqac_document_repository
GROUP BY tenant_id, naac_criterion, academic_year;

CREATE INDEX IF NOT EXISTS idx_iqac_mv_repo_health
  ON iqac_mv_repository_health(tenant_id, academic_year);

-- Seed NAAC criterion folders (demo)
WITH t AS (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1)
INSERT INTO iqac_document_repository (tenant_id, naac_criterion, metric_number, title, file_path, academic_year)
SELECT t.tenant_id, c.criterion, c.metric, c.title, c.path, '2025-2026'
FROM t
CROSS JOIN (VALUES
  (1, '1.1.1', 'Curriculum Design Policy', '/uploads/iqac/c1-curriculum-policy.pdf'),
  (2, '2.1.1', 'Teaching-Learning Plan', '/uploads/iqac/c2-tlp-plan.pdf'),
  (3, '3.2.1', 'Research Promotion MoU', '/uploads/iqac/c3-research-mou.pdf'),
  (4, '4.1.1', 'Infrastructure Audit', '/uploads/iqac/c4-infra-audit.pdf'),
  (5, '5.1.1', 'Student Support Charter', '/uploads/iqac/c5-support-charter.pdf'),
  (6, '6.2.1', 'Governance Ordinance', '/uploads/iqac/c6-governance.pdf'),
  (7, '7.1.1', 'Institutional Best Practices', '/uploads/iqac/c7-best-practices.pdf')
) AS c(criterion, metric, title, path)
WHERE NOT EXISTS (
  SELECT 1 FROM iqac_document_repository r WHERE r.tenant_id = t.tenant_id AND r.title = c.title
);

REFRESH MATERIALIZED VIEW iqac_mv_placement_stats;
REFRESH MATERIALIZED VIEW iqac_mv_faculty_metrics;
REFRESH MATERIALIZED VIEW iqac_mv_student_counts;
REFRESH MATERIALIZED VIEW iqac_mv_repository_health;
