-- Allow faculty-led moonshots (guide without student yet) and index guide lookups.

ALTER TABLE moonshot_projects
  ALTER COLUMN student_user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moonshot_projects_guide
  ON moonshot_projects (tenant_id, guide_user_id)
  WHERE guide_user_id IS NOT NULL;
