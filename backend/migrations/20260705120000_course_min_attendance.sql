-- Add min_attendance column to academic_courses for subject-specific overrides.
ALTER TABLE academic_courses ADD COLUMN IF NOT EXISTS min_attendance INT DEFAULT NULL CHECK (min_attendance BETWEEN 0 AND 100);
