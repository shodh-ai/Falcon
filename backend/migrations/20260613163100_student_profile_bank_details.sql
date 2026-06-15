-- Student portal profile reads/writes bank_details (student-portal.service.ts).

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS bank_details JSONB;
