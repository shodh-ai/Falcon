-- Exemption workflow: HOD approve/reject is final; admit card unlocks on HOD approval.
-- Legacy RECOMMENDED rows (old Exam Cell queue) go back to HOD for a decision.

UPDATE student_attendance_exemptions
SET status = 'PENDING_HOD', updated_at = NOW()
WHERE status = 'RECOMMENDED';
