-- Executive Financial Intelligence Platform foundation

-- Immutable audit ledger (Pillar 4)
CREATE TABLE IF NOT EXISTS system_audit_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'SOFT_DELETE')),
  old_value JSONB,
  new_value JSONB,
  changed_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_table_record
  ON system_audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_system_audit_logs_changed_at
  ON system_audit_logs (changed_at DESC);

-- Live feed persistence (Pillar 1)
CREATE TABLE IF NOT EXISTS leadership_feed_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('INCOME', 'EXPENSE', 'ALERT')),
  label TEXT NOT NULL,
  amount NUMERIC(12,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leadership_feed_tenant_created
  ON leadership_feed_events (tenant_id, created_at DESC);

-- Anomaly flags (Pillar 3)
CREATE TABLE IF NOT EXISTS fin_anomaly_flags (
  flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('GREEN', 'YELLOW', 'RED')),
  rule_code VARCHAR(60) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_anomaly_flags_tenant_severity
  ON fin_anomaly_flags (tenant_id, severity, created_at DESC);

-- Department financial scores (Pillar 5)
CREATE TABLE IF NOT EXISTS dept_financial_scores (
  score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  score_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  budget_adherence NUMERIC(5,2) NOT NULL DEFAULT 0,
  roi_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  receivables_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, department_id, score_date)
);

-- Cash flow forecasts (Pillar 2)
CREATE TABLE IF NOT EXISTS cash_flow_forecasts (
  forecast_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  horizon_days INT NOT NULL CHECK (horizon_days IN (30, 90, 180)),
  forecast_date DATE NOT NULL DEFAULT CURRENT_DATE,
  projected_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, horizon_days, forecast_date)
);

-- Vendor performance extensions (Pillar 5)
ALTER TABLE fin_vendors ADD COLUMN IF NOT EXISTS delayed_payment_count INT NOT NULL DEFAULT 0;
ALTER TABLE fin_vendors ADD COLUMN IF NOT EXISTS overbilling_flags INT NOT NULL DEFAULT 0;
ALTER TABLE fin_vendors ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE fin_vendors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE fin_vendor_invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE fin_vendor_invoices ADD COLUMN IF NOT EXISTS duplicate_hash VARCHAR(64);
ALTER TABLE fin_vendor_invoices ADD COLUMN IF NOT EXISTS department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL;
ALTER TABLE fin_vendor_invoices ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE fin_vendor_invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fin_vendor_invoices_dup_hash
  ON fin_vendor_invoices (tenant_id, duplicate_hash) WHERE duplicate_hash IS NOT NULL;

-- Finance table soft-delete columns
ALTER TABLE finance_fee_demands ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_late_fine_policies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_fee_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_bulk_jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_ledger_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_expense_heads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_journal_lines ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_gst_tds_tracking ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_auto_receipts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Core entity soft-delete columns (batch)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE task_master ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE handover_log ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE iam_programs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE admissions_leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE admissions_applications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE admissions_document_verifications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_subjects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_sis_batches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_courses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE student_course_enrollments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_timetables ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_assignments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE course_attendance_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_attendance_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_grading_policies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_mentorships ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE student_certificates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE academic_proctor_interactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE mentorship_chats ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE mentorship_meetings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hr_leave_balances ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hr_staff_attendance ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hr_holidays ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hr_employee_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hr_daily_attendance ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE staff_leave_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE staff_payslips ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE staff_gate_passes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE placement_job_postings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE placement_job_applications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE alumni_service_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE alumni_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE operations_hostel_rooms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE operations_gate_passes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hostel_allocations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hostel_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE operations_library_books ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE operations_transport_routes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE system_alerts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE falcon_notifications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
