-- Preserve the exact published source session reviewed by the proposer.
-- Existing historical moves remain readable; only new requests carry a snapshot.
ALTER TABLE academic_class_moves
  ADD COLUMN IF NOT EXISTS source_start_time TIME,
  ADD COLUMN IF NOT EXISTS source_end_time TIME,
  ADD COLUMN IF NOT EXISTS source_room VARCHAR(80),
  ADD COLUMN IF NOT EXISTS source_section VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_roster_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS academic_class_moves_pending_target
  ON academic_class_moves (tenant_id, target_date, target_start_time, target_end_time)
  WHERE status = 'PENDING_HOD_APPROVAL';

-- Legacy extra-class requests had only a timestamp and course, so their
-- student group, room and duration could not be verified. New requests carry
-- explicit dated-session identity while old rows remain readable.
ALTER TABLE class_adjustments
  ADD COLUMN IF NOT EXISTS timetable_id UUID REFERENCES academic_timetables(timetable_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section VARCHAR(50),
  ADD COLUMN IF NOT EXISTS room VARCHAR(80),
  ADD COLUMN IF NOT EXISTS session_date DATE,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS roster_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS class_adjustments_approved_sessions
  ON class_adjustments (tenant_id, session_date, start_time, end_time)
  WHERE status = 'APPROVED' AND adjustment_type = 'EXTRA_CLASS';
