-- academic_assignments.start_date and due_date were created as TIMESTAMP WITHOUT TIME ZONE
-- while the Nest entity expects timestamptz. Values were stored as IST wall-clock times, so
-- SQL comparisons like start_date <= NOW() (UTC session) hid newly published DAs from students.

ALTER TABLE academic_assignments
  ALTER COLUMN start_date TYPE TIMESTAMPTZ
    USING (start_date AT TIME ZONE 'Asia/Kolkata');

ALTER TABLE academic_assignments
  ALTER COLUMN due_date TYPE TIMESTAMPTZ
    USING (due_date AT TIME ZONE 'Asia/Kolkata');
