-- LMS: syllabus modules & course materials linkage

CREATE TABLE IF NOT EXISTS course_modules (
  module_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  module_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, module_number)
);

CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(tenant_id, course_id, module_number);

ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES course_modules(module_id) ON DELETE SET NULL;
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS material_type VARCHAR(50) DEFAULT 'NOTES';

-- Seed: 3 modules for CSE101 (Ellwil / Sachin QA)
WITH ctx AS (
  SELECT
    t.tenant_id,
    c.course_id,
    u.user_id AS faculty_id
  FROM academic_courses c
  CROSS JOIN public.tenants t
  INNER JOIN users u ON lower(u.official_email) = 'ellwil@mygyanvihar.com'
  WHERE c.course_code = 'CSE101' AND t.subdomain = 'sgvu'
  LIMIT 1
),
ins AS (
  INSERT INTO course_modules (tenant_id, course_id, faculty_user_id, module_number, title, description, status, completed_at)
  SELECT ctx.tenant_id, ctx.course_id, ctx.faculty_id, data.num, data.title, data.module_desc, data.status,
         CASE WHEN data.status = 'COMPLETED' THEN NOW() ELSE NULL END
  FROM ctx
  CROSS JOIN (VALUES
    (1, 'Introduction & Number Systems', 'Fundamentals and binary arithmetic', 'COMPLETED'),
    (2, 'Matrices & Linear Algebra', 'Matrix operations and determinants', 'IN_PROGRESS'),
    (3, 'Calculus Foundations', 'Limits, continuity, and differentiation', 'PENDING')
  ) AS data(num, title, module_desc, status)
  ON CONFLICT (course_id, module_number) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    completed_at = EXCLUDED.completed_at,
    updated_at = NOW()
  RETURNING module_id, module_number, course_id, tenant_id, faculty_user_id, status
)
INSERT INTO course_materials (tenant_id, course_id, faculty_user_id, module_id, title, file_path, material_type)
SELECT i.tenant_id, i.course_id, i.faculty_user_id, i.module_id,
       'Module 1 — Lecture Notes (PDF)',
       'a0000000-0000-4000-8000-000000000001/course-materials/cse101-module1-notes.pdf',
       'NOTES'
FROM ins i
WHERE i.module_number = 1 AND i.status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM course_materials m WHERE m.module_id = i.module_id
  );
