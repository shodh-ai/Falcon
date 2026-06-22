-- Fix Ph.D. committee persona passwords to password123 (matches other QA personas).

UPDATE users
SET password_hash = '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO',
    is_active = true,
    updated_at = NOW()
WHERE lower(official_email) IN (
  'drc@mygyanvihar.com',
  'rac@mygyanvihar.com',
  'rrc@mygyanvihar.com',
  'adjudicator@mygyanvihar.com'
);
