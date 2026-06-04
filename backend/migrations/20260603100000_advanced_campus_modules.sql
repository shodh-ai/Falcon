-- Advanced Campus Modules: hierarchy, admissions CRM, LMS, hostel tatkal, campus wallet/mess

-- ========== Hierarchy & sections ==========
CREATE TABLE IF NOT EXISTS academic_sections (
  section_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  batch_id UUID,
  program_id INT,
  section_name VARCHAR(40) NOT NULL,
  capacity INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hierarchy_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  assignment_type VARCHAR(40) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, assignment_type, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS section_student_members (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES academic_sections(section_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  impersonator_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  reason TEXT
);

ALTER TABLE schools ADD COLUMN IF NOT EXISTS dean_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE admissions_leads ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE;
ALTER TABLE admissions_leads ADD COLUMN IF NOT EXISTS lead_score INT NOT NULL DEFAULT 0;

-- ========== Admissions CRM activity ==========
CREATE TABLE IF NOT EXISTS admissions_lead_activities (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES admissions_leads(lead_id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NOT NULL DEFAULT 'OUTBOUND',
  subject VARCHAR(255),
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON admissions_lead_activities(lead_id, created_at DESC);

-- ========== LMS quizzes & forums ==========
CREATE TABLE IF NOT EXISTS lms_quizzes (
  quiz_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  title VARCHAR(200) NOT NULL,
  time_limit_mins INT,
  max_attempts INT NOT NULL DEFAULT 1,
  browser_lock BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_questions (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES lms_quizzes(quiz_id) ON DELETE CASCADE,
  question_type VARCHAR(20) NOT NULL DEFAULT 'MCQ',
  prompt TEXT NOT NULL,
  points INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lms_question_options (
  option_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES lms_questions(question_id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS lms_student_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES lms_quizzes(quiz_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  score NUMERIC(6,2),
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
  anti_cheat_events JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS lms_attempt_answers (
  answer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES lms_student_attempts(attempt_id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES lms_questions(question_id) ON DELETE CASCADE,
  selected_option_id UUID REFERENCES lms_question_options(option_id) ON DELETE SET NULL,
  descriptive_answer TEXT,
  is_correct BOOLEAN,
  points_awarded NUMERIC(6,2)
);

CREATE TABLE IF NOT EXISTS lms_live_classes (
  live_class_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  title VARCHAR(200) NOT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'GOOGLE_MEET',
  meeting_url TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  recording_url TEXT,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_forum_threads (
  thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  author_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  upvotes INT NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_forum_posts (
  post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES lms_forum_threads(thread_id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  upvotes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_forum_votes (
  vote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  target_type VARCHAR(10) NOT NULL,
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_type, target_id)
);

-- Extend course materials for SCORM/H5P/video
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS content_type VARCHAR(30) NOT NULL DEFAULT 'PDF';
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS external_url TEXT;
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS scorm_package_path TEXT;

-- ========== Hostel Tatkal ==========
CREATE TABLE IF NOT EXISTS hostel_beds (
  bed_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  room_id INT NOT NULL REFERENCES operations_hostel_rooms(room_id) ON DELETE CASCADE,
  bed_number VARCHAR(10) NOT NULL,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, bed_number)
);

CREATE TABLE IF NOT EXISTS hostel_tatkal_sales (
  sale_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hostel_booking_holds (
  hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  sale_id UUID REFERENCES hostel_tatkal_sales(sale_id) ON DELETE SET NULL,
  bed_id UUID NOT NULL REFERENCES hostel_beds(bed_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  payment_ref VARCHAR(120),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hostel_holds_bed_status ON hostel_booking_holds(bed_id, status);

-- Seed beds from room capacity (idempotent)
INSERT INTO hostel_beds (tenant_id, room_id, bed_number, is_premium)
SELECT t.tenant_id, r.room_id, 'B' || gs.n, (gs.n = 1)
FROM operations_hostel_rooms r
CROSS JOIN generate_series(1, GREATEST(r.capacity, 1)) AS gs(n)
CROSS JOIN (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1) t
WHERE NOT EXISTS (
  SELECT 1 FROM hostel_beds b WHERE b.room_id = r.room_id AND b.bed_number = 'B' || gs.n
);

-- ========== Campus Wallet & Mess ==========
CREATE TABLE IF NOT EXISTS campus_wallets (
  wallet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  current_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS campus_wallet_ledger (
  ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES campus_wallets(wallet_id) ON DELETE CASCADE,
  entry_type VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  reference_id VARCHAR(120),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mess_addon_catalog (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  item_name VARCHAR(100) NOT NULL,
  price DECIMAL(5,2) NOT NULL,
  meal_type VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mess_addon_orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  item_id UUID REFERENCES mess_addon_catalog(item_id) ON DELETE SET NULL,
  item_name VARCHAR(100) NOT NULL,
  amount_deducted DECIMAL(5,2) NOT NULL,
  order_date DATE NOT NULL,
  meal_type VARCHAR(20),
  is_redeemed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mess_meal_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO mess_addon_catalog (tenant_id, item_name, price, meal_type)
SELECT t.tenant_id, v.item_name, v.price, v.meal_type
FROM tenants t
CROSS JOIN (VALUES
  ('Add Omelet', 30.00, 'BREAKFAST'),
  ('Add Extra Paneer', 50.00, 'LUNCH'),
  ('Midnight Maggi', 40.00, 'DINNER')
) AS v(item_name, price, meal_type)
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (
    SELECT 1 FROM mess_addon_catalog c WHERE c.tenant_id = t.tenant_id AND c.item_name = v.item_name
  );

INSERT INTO tenant_subscriptions (tenant_id, feature_key, is_enabled)
SELECT tenant_id, 'campus_wallet', true FROM tenants WHERE subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM tenant_subscriptions ts WHERE ts.tenant_id = tenants.tenant_id AND ts.feature_key = 'campus_wallet');

INSERT INTO tenant_subscriptions (tenant_id, feature_key, is_enabled)
SELECT tenant_id, 'hostel_tatkal', true FROM tenants WHERE subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM tenant_subscriptions ts WHERE ts.tenant_id = tenants.tenant_id AND ts.feature_key = 'hostel_tatkal');

INSERT INTO hostel_tatkal_sales (tenant_id, title, starts_at, ends_at, is_active)
SELECT t.tenant_id, 'Tatkal Hostel Sale 2026', NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', true
FROM tenants t WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM hostel_tatkal_sales s WHERE s.tenant_id = t.tenant_id AND s.is_active = true);
