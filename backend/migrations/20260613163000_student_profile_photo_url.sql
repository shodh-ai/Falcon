-- Student master profile reads/writes profile_photo_url (student-portal.service.ts).

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
