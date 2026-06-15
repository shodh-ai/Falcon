const { Client } = require('pg');
const client = new Client({ user: 'postgres', password: 'postgres', host: 'localhost', port: 5432, database: 'university_governance' });

client.connect().then(() => {
  const seedQuery = `
    DO $$
    DECLARE
      tenant_uuid UUID := 'a0000000-0000-4000-8000-000000000001';
      faculty_uuid UUID;
      student_uuid UUID;
      course_uuid UUID;
      subject_id_val INT;
    BEGIN
      -- 1. Find a Faculty
      SELECT u.user_id INTO faculty_uuid FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.role_name = 'Faculty' LIMIT 1;
      
      -- 2. Find a Student
      SELECT u.user_id INTO student_uuid FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.role_name = 'Student' LIMIT 1;

      IF faculty_uuid IS NOT NULL AND student_uuid IS NOT NULL THEN
        
        -- 3. Find or Create a Subject
        SELECT subject_id INTO subject_id_val FROM academic_subjects LIMIT 1;
        IF subject_id_val IS NULL THEN
          INSERT INTO academic_subjects (subject_code, subject_name, program_id, credits)
          VALUES ('SMK-101', 'Smoke Subject', 1, 3) RETURNING subject_id INTO subject_id_val;
        END IF;

        -- 4. Find or Create a Course
        SELECT course_id INTO course_uuid FROM academic_courses LIMIT 1;
        IF course_uuid IS NULL THEN
          course_uuid := gen_random_uuid();
          INSERT INTO academic_courses (course_id, tenant_id, course_code, course_name, credits)
          VALUES (course_uuid, tenant_uuid, 'C-SMK', 'Smoke Course', 3);
        END IF;

        -- 5. Create Timetable for Faculty
        INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id)
        VALUES (tenant_uuid, course_uuid, 1, '10:00:00', '11:00:00', 'Room 101', faculty_uuid);

        -- 6. Enroll Student
        INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status)
        VALUES (tenant_uuid, student_uuid, course_uuid, 1, 'ENROLLED') ON CONFLICT DO NOTHING;

        -- 7. Insert bad attendance (1 Present, 4 Absent = 20%)
        INSERT INTO academic_attendance_records (student_user_id, subject_id, session_date, status)
        VALUES 
          (student_uuid, subject_id_val, CURRENT_DATE - 5, 'ABSENT'),
          (student_uuid, subject_id_val, CURRENT_DATE - 4, 'ABSENT'),
          (student_uuid, subject_id_val, CURRENT_DATE - 3, 'ABSENT'),
          (student_uuid, subject_id_val, CURRENT_DATE - 2, 'ABSENT'),
          (student_uuid, subject_id_val, CURRENT_DATE - 1, 'PRESENT');

        -- 8. Insert bad exam result (10/100)
        INSERT INTO academic_exam_results (student_user_id, subject_id, exam_session, marks_obtained, max_marks)
        VALUES (student_uuid, subject_id_val, 'MIDTERM-1', 10, 100);

      END IF;
    END $$;
  `;
  
  client.query(seedQuery)
    .then(res => { console.log('At-Risk smoke data injected successfully!'); client.end(); })
    .catch(err => { console.error('Error injecting smoke data:', err); client.end(); });
});
