-- Auto-sync Google Form submissions into placement drive registrations

ALTER TABLE hod_dept_placement_drives
  ADD COLUMN IF NOT EXISTS google_form_webhook_secret VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_hod_placement_responses_google_id
  ON hod_dept_placement_responses ((response_json->>'google_response_id'))
  WHERE response_json->>'google_response_id' IS NOT NULL;
