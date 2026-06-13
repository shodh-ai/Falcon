-- Enterprise performance phase 1: hot-path indexes for finance, journals, grade cards, reporting.

CREATE INDEX IF NOT EXISTS idx_finance_fee_demands_student_status
  ON finance_fee_demands(student_user_id, status);

CREATE INDEX IF NOT EXISTS idx_finance_fee_demands_tenant_status
  ON finance_fee_demands(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_student_status_created
  ON finance_transactions(student_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_tenant_created
  ON finance_transactions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_journal_entries_tenant_date
  ON finance_journal_entries(tenant_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_grade_cards_student
  ON grade_cards(student_user_id);

CREATE INDEX IF NOT EXISTS idx_grade_cards_tenant_student
  ON grade_cards(tenant_id, student_user_id);

CREATE INDEX IF NOT EXISTS idx_users_reporting_officer
  ON users(reporting_officer_id)
  WHERE reporting_officer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_official_email
  ON users(tenant_id, lower(official_email));

CREATE INDEX IF NOT EXISTS idx_exam_seating_plans_tenant_published
  ON exam_seating_plans(tenant_id, published)
  WHERE published = true;

CREATE INDEX IF NOT EXISTS idx_hr_shift_allocations_user_active
  ON hr_shift_allocations(tenant_id, entity_id, user_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_hr_shift_allocations_dept_active
  ON hr_shift_allocations(tenant_id, entity_id, department_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_staff_leave_requests_staff_dates
  ON staff_leave_requests(staff_user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_hr_holidays_date_entity
  ON hr_holidays(date, entity_id);
