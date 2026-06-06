-- Hotfix sprint: profile correction category, leave remarks, extracurricular verification

-- Helpdesk: STUDENT_PROFILE category for profile corrections
ALTER TABLE helpdesk_tickets DROP CONSTRAINT IF EXISTS chk_helpdesk_tickets_category;
ALTER TABLE helpdesk_tickets
  ADD CONSTRAINT chk_helpdesk_tickets_category
  CHECK (category IN ('FINANCE', 'ACADEMICS', 'IT', 'HOSTEL', 'MENTORSHIP', 'STUDENT_PROFILE'));

-- Staff leave: store HOD/HR rejection remarks for faculty visibility
ALTER TABLE staff_leave_requests
  ADD COLUMN IF NOT EXISTS approver_remarks TEXT NULL;

-- Extracurriculars: student-initiated log with verification workflow
ALTER TABLE student_extracurriculars
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'VERIFIED'
    CHECK (verification_status IN ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'));
ALTER TABLE student_extracurriculars
  ADD COLUMN IF NOT EXISTS certificate_file_path TEXT NULL;

-- Class adjustments: HOD rejection remarks
ALTER TABLE class_adjustments
  ADD COLUMN IF NOT EXISTS hod_remarks TEXT NULL;
