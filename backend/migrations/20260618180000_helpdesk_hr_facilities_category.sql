-- Allow HR and Facilities grievance categories on helpdesk tickets (faculty ESS panel).

ALTER TABLE helpdesk_tickets DROP CONSTRAINT IF EXISTS chk_helpdesk_tickets_category;
ALTER TABLE helpdesk_tickets
  ADD CONSTRAINT chk_helpdesk_tickets_category
  CHECK (category IN (
    'FINANCE',
    'ACADEMICS',
    'IT',
    'HOSTEL',
    'MENTORSHIP',
    'STUDENT_PROFILE',
    'HR',
    'FACILITIES'
  ));
