-- Enforce first-login onboarding wizard for new student/faculty/HOD/dean/applicant accounts.
-- Existing rows are untouched; only INSERT sets wizard status when not explicitly completed.

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users ALTER COLUMN onboarding_status DROP DEFAULT;
ALTER TABLE users ALTER COLUMN onboarding_status SET DEFAULT NULL;

CREATE OR REPLACE FUNCTION trg_users_portal_onboarding_defaults()
RETURNS TRIGGER AS $$
DECLARE
  role_name text;
  wizard_role boolean;
BEGIN
  SELECT lower(r.role_name)
  INTO role_name
  FROM roles r
  WHERE r.role_id = NEW.role_id;

  wizard_role := role_name IN ('student', 'applicant', 'faculty', 'hod', 'dean');

  IF NEW.onboarding_profile IS NULL THEN
    NEW.onboarding_profile := '{}'::jsonb;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF wizard_role THEN
      IF NEW.onboarding_status IS NULL
         OR NEW.onboarding_status IN ('ACTIVE', 'PENDING_ONBOARDING') THEN
        NEW.onboarding_status := 'PENDING_PASSWORD_RESET';
      END IF;
    ELSIF NEW.onboarding_status IS NULL THEN
      NEW.onboarding_status := 'PENDING_ONBOARDING';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_portal_onboarding_defaults ON users;
CREATE TRIGGER users_portal_onboarding_defaults
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trg_users_portal_onboarding_defaults();
