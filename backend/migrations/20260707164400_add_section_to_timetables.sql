-- Add section column to academic_timetables
ALTER TABLE academic_timetables ADD COLUMN IF NOT EXISTS section VARCHAR(50) DEFAULT 'A';
UPDATE academic_timetables SET section = 'A' WHERE section IS NULL;
ALTER TABLE academic_timetables ALTER COLUMN section SET NOT NULL;
