-- Dynamic borrowing rules by patron role (Student vs Faculty, etc.)

CREATE TABLE IF NOT EXISTS lib_borrowing_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(50) UNIQUE NOT NULL,
  max_books_allowed INT NOT NULL,
  max_days_allowed INT NOT NULL,
  fine_per_day DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO lib_borrowing_rules (role_name, max_books_allowed, max_days_allowed, fine_per_day)
VALUES
  ('Student', 3, 14, 10.00),
  ('Faculty', 10, 180, 0.00),
  ('HOD', 10, 180, 0.00),
  ('Dean', 10, 180, 0.00),
  ('Librarian', 15, 365, 0.00)
ON CONFLICT (role_name) DO UPDATE SET
  max_books_allowed = EXCLUDED.max_books_allowed,
  max_days_allowed = EXCLUDED.max_days_allowed,
  fine_per_day = EXCLUDED.fine_per_day;
