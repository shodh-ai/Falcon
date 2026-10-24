-- Expand-only storage. Publication is an explicit reviewed import, not startup seeding.
BEGIN;
ALTER TABLE academic_timetables ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE academic_timetables ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE academic_timetables ADD COLUMN IF NOT EXISTS publication_id UUID;
CREATE TABLE IF NOT EXISTS academic_timetable_publications (
  publication_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  source_sha256 TEXT NOT NULL,
  revision TEXT NOT NULL,
  activated_on DATE NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ACTIVE','ROLLED_BACK')),
  manifest JSONB NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, revision)
);
CREATE TABLE IF NOT EXISTS academic_timetable_source_entries (
  publication_id UUID NOT NULL REFERENCES academic_timetable_publications(publication_id),
  source_key TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  course_id UUID,
  faculty_user_ids UUID[] NOT NULL DEFAULT '{}',
  state TEXT NOT NULL CHECK (state IN ('CONFIRMED','HELD','ACTIVITY')),
  entry JSONB NOT NULL,
  timetable_id UUID,
  PRIMARY KEY (publication_id, source_key)
);
CREATE INDEX IF NOT EXISTS ix_timetable_source_faculty ON academic_timetable_source_entries USING gin(faculty_user_ids);
COMMIT;
