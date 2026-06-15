-- Performance sprint: indexes on frequently filtered/joined columns (idempotent).

-- entity_id across operational tables
CREATE INDEX IF NOT EXISTS idx_hr_employee_profiles_entity ON hr_employee_profiles(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_shifts_entity ON hr_shifts(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_dynamic_rules_entity ON hr_dynamic_rules(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_org_units_entity ON hr_org_units(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_leave_policies_entity ON hr_leave_policies(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_approval_workflows_entity ON hr_approval_workflows(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_resignation_requests_entity ON hr_resignation_requests(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_job_postings_entity ON hr_job_postings(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_applicants_entity ON hr_applicants(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_holidays_entity ON hr_holidays(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_biometric_logs_entity ON hr_biometric_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_users_entity ON users(entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_access_controls_entity ON hr_access_controls(tenant_id, user_id);

-- user_id on attendance, fines, marks
CREATE INDEX IF NOT EXISTS idx_hr_staff_attendance_user_date ON hr_staff_attendance(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_hr_daily_attendance_user_date ON hr_daily_attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_operations_hostel_fines_student ON operations_hostel_fines(student_user_id);
CREATE INDEX IF NOT EXISTS idx_academic_marks_student ON academic_marks(student_user_id);
CREATE INDEX IF NOT EXISTS idx_academic_marks_course_student ON academic_marks(tenant_id, course_id, student_user_id);

-- status on leaves, tickets, gate passes
CREATE INDEX IF NOT EXISTS idx_staff_leave_requests_status ON staff_leave_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_leave_requests_staff_status ON staff_leave_requests(staff_user_id, status);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_status ON helpdesk_tickets(status);
CREATE INDEX IF NOT EXISTS idx_operations_gate_passes_status ON operations_gate_passes(status);
CREATE INDEX IF NOT EXISTS idx_staff_gate_passes_status ON staff_gate_passes(status);
CREATE INDEX IF NOT EXISTS idx_operations_hostel_leaves_status ON operations_hostel_leaves(status);

-- list endpoint filters
CREATE INDEX IF NOT EXISTS idx_hostel_allocations_student_status ON hostel_allocations(student_user_id, status);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'placement_drives' AND column_name = 'tenant_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'placement_drives' AND column_name = 'status'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_placement_drives_tenant_status ON placement_drives(tenant_id, status);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_admin_timetable_tenant_year ON admin_timetable_slots(tenant_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_lib_borrowing_rules_role ON lib_borrowing_rules(role_name);
