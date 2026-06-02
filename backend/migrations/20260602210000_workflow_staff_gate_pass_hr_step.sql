-- Two-step staff gate pass: HOD (reporting officer) then HR.

ALTER TABLE staff_gate_passes DROP CONSTRAINT IF EXISTS staff_gate_passes_status_check;
ALTER TABLE staff_gate_passes
  ADD CONSTRAINT staff_gate_passes_status_check
  CHECK (status IN ('PENDING', 'PENDING_HR', 'APPROVED', 'REJECTED'));
