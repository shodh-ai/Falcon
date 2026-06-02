-- Examinations module tables

CREATE TABLE IF NOT EXISTS exam_schedules (
  exam_schedule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type varchar(20) NOT NULL,
  subject_id int NOT NULL,
  exam_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  venue varchar(120) NOT NULL,
  seat_no varchar(40),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_exam_date ON exam_schedules(exam_date);
CREATE INDEX IF NOT EXISTS idx_exam_schedules_subject_id ON exam_schedules(subject_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_exam_schedules_subject'
  ) THEN
    ALTER TABLE exam_schedules
      ADD CONSTRAINT fk_exam_schedules_subject
      FOREIGN KEY (subject_id) REFERENCES academic_subjects(subject_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_exam_schedules_type'
  ) THEN
    ALTER TABLE exam_schedules
      ADD CONSTRAINT chk_exam_schedules_type
      CHECK (exam_type IN ('MID_TERM', 'END_TERM', 'PRACTICAL'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS exam_applications (
  exam_application_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL,
  subject_id int NOT NULL,
  application_type varchar(20) NOT NULL,
  fee_status varchar(20) NOT NULL DEFAULT 'PENDING',
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  finance_demand_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_applications_student ON exam_applications(student_user_id);
CREATE INDEX IF NOT EXISTS idx_exam_applications_status ON exam_applications(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_exam_applications_subject'
  ) THEN
    ALTER TABLE exam_applications
      ADD CONSTRAINT fk_exam_applications_subject
      FOREIGN KEY (subject_id) REFERENCES academic_subjects(subject_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_exam_applications_student'
  ) THEN
    ALTER TABLE exam_applications
      ADD CONSTRAINT fk_exam_applications_student
      FOREIGN KEY (student_user_id) REFERENCES users(user_id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_exam_applications_demand'
  ) THEN
    ALTER TABLE exam_applications
      ADD CONSTRAINT fk_exam_applications_demand
      FOREIGN KEY (finance_demand_id) REFERENCES finance_fee_demands(demand_id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_exam_applications_type'
  ) THEN
    ALTER TABLE exam_applications
      ADD CONSTRAINT chk_exam_applications_type
      CHECK (application_type IN ('RE_EVALUATION', 'BACKLOG'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_exam_applications_fee_status'
  ) THEN
    ALTER TABLE exam_applications
      ADD CONSTRAINT chk_exam_applications_fee_status
      CHECK (fee_status IN ('PENDING', 'PAID', 'WAIVED'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_exam_applications_status'
  ) THEN
    ALTER TABLE exam_applications
      ADD CONSTRAINT chk_exam_applications_status
      CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'));
  END IF;
END $$;
