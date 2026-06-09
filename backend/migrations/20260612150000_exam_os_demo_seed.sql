-- Exam OS demo seed: programs, subjects, and exam schedules (fixes empty schedule dropdown)

INSERT INTO iam_programs (program_name, program_code, duration_years)
SELECT 'B.Tech Computer Science', 'BTECH-CSE', 4
WHERE NOT EXISTS (SELECT 1 FROM iam_programs LIMIT 1);

INSERT INTO academic_subjects (subject_code, subject_name, program_id, semester, credits, subject_type)
SELECT 'CSE401', 'Operating Systems', p.program_id, 4, 4, 'THEORY'
FROM iam_programs p
WHERE NOT EXISTS (SELECT 1 FROM academic_subjects LIMIT 1)
ORDER BY p.program_id
LIMIT 1;

INSERT INTO exam_schedules (tenant_id, exam_type, subject_id, exam_date, start_time, end_time, venue, max_marks, status, batch_label)
SELECT t.tenant_id, v.exam_type, s.subject_id, v.exam_date, v.start_time, v.end_time, v.venue, v.max_marks, 'SCHEDULED', 'B.Tech Sem 4'
FROM tenants t
CROSS JOIN LATERAL (SELECT subject_id FROM academic_subjects ORDER BY subject_id LIMIT 1) s
CROSS JOIN (VALUES
  ('MID_TERM'::varchar, (CURRENT_DATE + 14)::date, '09:00'::time, '12:00'::time, 'Block A Hall 1', 50),
  ('END_TERM'::varchar, (CURRENT_DATE + 28)::date, '09:00'::time, '12:00'::time, 'Block A Hall 1', 100)
) AS v(exam_type, exam_date, start_time, end_time, venue, max_marks)
WHERE t.subdomain = 'sgvu'
  AND s.subject_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM exam_schedules es WHERE es.batch_label = 'B.Tech Sem 4' LIMIT 1);
