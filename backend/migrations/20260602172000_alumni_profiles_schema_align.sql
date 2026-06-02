ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS program_name VARCHAR(180);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'alumni_profiles'
      AND column_name = 'alumni_profile_id'
  ) THEN
    EXECUTE 'UPDATE alumni_profiles SET alumni_id = alumni_profile_id WHERE alumni_id IS NULL';
  ELSE
    UPDATE alumni_profiles SET alumni_id = gen_random_uuid() WHERE alumni_id IS NULL;
  END IF;
END $$;
