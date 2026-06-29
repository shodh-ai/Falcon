const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

pool.query(`
SELECT u.user_id, u.name, 
  COALESCE(
    (
      SELECT json_agg(doc_row)
      FROM (
        SELECT c.title, c.file_path, c.uploaded_at
        FROM student_certificates c
        WHERE c.student_user_id = u.user_id
        UNION ALL
        SELECT 
          CASE 
            WHEN o.doc_type = '10TH_MARKSHEET' THEN '10th Marksheet'
            WHEN o.doc_type = '12TH_MARKSHEET' THEN '12th Marksheet'
            WHEN o.doc_type = 'AADHAAR' THEN 'Aadhar Card'
            WHEN o.doc_type = 'PAN' THEN 'PAN Card'
            WHEN o.doc_type = 'PHOTO' THEN 'Photograph'
            ELSE o.doc_type
          END as title,
          o.file_path,
          o.uploaded_at
        FROM student_onboarding_docs o
        WHERE o.student_user_id = u.user_id AND o.status = 'APPROVED'
      ) as doc_row
    ), '[]'::json
  ) as documents
FROM users u
WHERE u.user_id = 'f1000002-0000-4000-8000-000000000002'
`).then(res => {
  console.dir(res.rows[0].documents, { depth: null });
  pool.end();
}).catch(console.error);
