-- Extend placement_ats_* tables (used when legacy placement_drives exists)

ALTER TABLE placement_ats_drives ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE placement_ats_drives ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;
ALTER TABLE placement_ats_drives ADD COLUMN IF NOT EXISTS job_role VARCHAR(255);
ALTER TABLE placement_ats_drives ADD COLUMN IF NOT EXISTS package_lpa NUMERIC(5,2);
ALTER TABLE placement_ats_drives ADD COLUMN IF NOT EXISTS max_active_backlogs INT NOT NULL DEFAULT 0;

UPDATE placement_ats_drives SET job_role = job_profile WHERE job_role IS NULL;
UPDATE placement_ats_drives SET package_lpa = package_details_lpa WHERE package_lpa IS NULL;
UPDATE placement_ats_drives SET max_active_backlogs = max_backlogs
  WHERE max_active_backlogs = 0 AND max_backlogs > 0;
UPDATE placement_ats_drives SET status = 'ACTIVE' WHERE status IN ('OPEN', 'open');

ALTER TABLE placement_ats_drive_applications ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) NOT NULL DEFAULT 'APPLIED';
ALTER TABLE placement_ats_drive_applications ADD COLUMN IF NOT EXISTS resume_file_path TEXT;
ALTER TABLE placement_ats_drive_applications ADD COLUMN IF NOT EXISTS cgpa_at_apply NUMERIC(4,2);
ALTER TABLE placement_ats_drive_applications ADD COLUMN IF NOT EXISTS active_backlogs_at_apply INT NOT NULL DEFAULT 0;
ALTER TABLE placement_ats_drive_applications ADD COLUMN IF NOT EXISTS rejected_at_stage VARCHAR(50);
ALTER TABLE placement_ats_drive_applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_placement_ats_drive_apps_stage
  ON placement_ats_drive_applications(drive_id, pipeline_stage);
