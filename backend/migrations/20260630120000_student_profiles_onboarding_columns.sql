-- student_profiles columns required by POST /api/student/onboarding/profile
-- Production could 500 when parent_info, status, enrollment_no, or batch were never migrated.

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_info JSONB;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS enrollment_no VARCHAR(50);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS batch VARCHAR(50);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_profiles'
      AND column_name = 'parent_contacts'
  ) THEN
    UPDATE student_profiles
    SET parent_info = parent_contacts
    WHERE parent_info IS NULL AND parent_contacts IS NOT NULL;
  END IF;
END $$;

ALTER TABLE student_profiles ALTER COLUMN blood_group TYPE VARCHAR(10);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_profiles'
      AND column_name = 'profile_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_profiles'
      AND column_name = 'student_profile_id'
  ) THEN
    ALTER TABLE student_profiles RENAME COLUMN profile_id TO student_profile_id;
  END IF;
END $$;
