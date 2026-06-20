-- Persist seating allocation runs for Exam Cell seating planner UI.

CREATE TABLE IF NOT EXISTS exam_seating_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  allocation_strategy VARCHAR(30) NOT NULL,
  exam_type VARCHAR(30),
  exam_schedule_id UUID REFERENCES exam_schedules(exam_schedule_id) ON DELETE SET NULL,
  semester INT NOT NULL,
  branch VARCHAR(80) NOT NULL DEFAULT 'All Branches',
  allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_seating_runs_tenant_created
  ON exam_seating_runs(tenant_id, created_at DESC);
