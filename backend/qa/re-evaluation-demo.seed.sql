-- Explicit local QA setup only; never part of normal migrations or official results.
CREATE SCHEMA IF NOT EXISTS local_reevaluation_qa;
CREATE TABLE IF NOT EXISTS local_reevaluation_qa.cases (
  request_id uuid PRIMARY KEY CHECK (request_id IN (
    'a1000002-0000-4000-8000-000000000002',
    'a1000003-0000-4000-8000-000000000003'
  )),
  tenant_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  qa_result_id uuid NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'LOCAL_QA' CHECK (source = 'LOCAL_QA'),
  exam_session text NOT NULL,
  exam_type text NOT NULL DEFAULT 'END_TERM' CHECK (exam_type = 'END_TERM'),
  original_marks numeric(6,2) NOT NULL CHECK (original_marks >= 0),
  max_marks numeric(6,2) NOT NULL CHECK (max_marks > 0 AND original_marks <= max_marks),
  revised_marks numeric(6,2) CHECK (revised_marks BETWEEN 0 AND max_marks),
  result_marks numeric(6,2) NOT NULL CHECK (result_marks BETWEEN 0 AND max_marks),
  report_notes text,
  status text NOT NULL CHECK (status IN ('ASSIGNED','UNDER_REVIEW','COMPLETED')),
  initial_status text NOT NULL CHECK (initial_status IN ('ASSIGNED','UNDER_REVIEW')),
  initial_revised_marks numeric(6,2),
  initial_report_notes text,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0)
);

DO $$
DECLARE matched integer;
BEGIN
  SELECT count(*) INTO matched
  FROM public.exam_applications a
  JOIN public.users u ON u.user_id=a.student_user_id AND u.deleted_at IS NULL
  JOIN public.tenants t ON t.tenant_id=u.tenant_id AND t.subdomain='sgvu'
  JOIN public.academic_subjects s ON s.subject_id=a.subject_id AND s.subject_code='SMOKE101' AND s.deleted_at IS NULL
  WHERE a.exam_application_id IN ('a1000002-0000-4000-8000-000000000002','a1000003-0000-4000-8000-000000000003')
    AND lower(u.official_email)='student4@mygyanvihar.com'
    AND a.application_type='RE_EVALUATION' AND a.deleted_at IS NULL
    AND a.exam_result_id IS NULL AND a.original_marks=42
    AND ((a.exam_application_id='a1000002-0000-4000-8000-000000000002' AND a.status='ASSIGNED' AND a.revised_marks IS NULL)
      OR (a.exam_application_id='a1000003-0000-4000-8000-000000000003' AND a.status='UNDER_REVIEW' AND a.revised_marks=46))
    AND EXISTS (SELECT 1 FROM public.smoke_seed_manifest WHERE smoke_key='exam-cell.demo-completion');
  IF matched <> 2 THEN
    RAISE EXCEPTION 'Expected exactly the two unchanged Student Four / SMOKE101 demo requests. No QA setup was applied.';
  END IF;
END $$;

INSERT INTO local_reevaluation_qa.cases (
  request_id,tenant_id,student_user_id,qa_result_id,exam_session,
  original_marks,max_marks,revised_marks,result_marks,report_notes,status,
  initial_status,initial_revised_marks,initial_report_notes
)
SELECT a.exam_application_id,u.tenant_id,u.user_id,
  CASE WHEN a.status='ASSIGNED' THEN 'b2000002-0000-4000-8000-000000000002'::uuid
    ELSE 'b2000003-0000-4000-8000-000000000003'::uuid END,
  'LOCAL QA / SMOKE101 / ' || CASE WHEN a.status='ASSIGNED' THEN 'Assigned scenario' ELSE 'Review scenario' END,
  a.original_marks,100,a.revised_marks,a.original_marks,a.report_notes,a.status,
  a.status,a.revised_marks,a.report_notes
FROM public.exam_applications a
JOIN public.users u ON u.user_id=a.student_user_id
WHERE a.exam_application_id IN ('a1000002-0000-4000-8000-000000000002','a1000003-0000-4000-8000-000000000003')
ON CONFLICT (request_id) DO NOTHING;
