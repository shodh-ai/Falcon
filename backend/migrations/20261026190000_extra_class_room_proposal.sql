-- Expand only: record the room actually validated for an approved extra class.
ALTER TABLE class_adjustments ADD COLUMN IF NOT EXISTS proposed_room VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_class_adjustments_slot_lookup
  ON class_adjustments (tenant_id, status, new_date)
  WHERE adjustment_type IN ('EXTRA_CLASS', 'CANCEL');
