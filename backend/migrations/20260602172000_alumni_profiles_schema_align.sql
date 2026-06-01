ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS program_name VARCHAR(180);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

UPDATE alumni_profiles SET alumni_id = alumni_profile_id WHERE alumni_id IS NULL;
