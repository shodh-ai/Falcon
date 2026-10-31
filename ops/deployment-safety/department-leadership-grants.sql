-- Explicit scoped migration follow-up, never API startup or automatic grants.
-- Applies only the reviewed limited relation ACLs to existing falcon_runtime.
-- Review/test against isolated PostgreSQL18 before use. No credential handling,
-- role creation, existing data edits, ownership, PUBLIC/other-role revocation,
-- database/schema/sequence grants or other-table ACL changes are performed.
-- Required psql variables: runtime_role=falcon_runtime, runtime_database,
-- runtime_schema=public. Use a separately authorized owner/migration connection.
\set ON_ERROR_STOP on
\if :{?runtime_role}
\else
  \echo 'runtime_role is required'
  \quit 1
\endif
\if :{?runtime_database}
\else
  \echo 'runtime_database is required'
  \quit 1
\endif
\if :{?runtime_schema}
\else
  \echo 'runtime_schema is required'
  \quit 1
\endif

BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('falcon.runtime_role', :'runtime_role', true),
       set_config('falcon.runtime_database', :'runtime_database', true),
       set_config('falcon.runtime_schema', :'runtime_schema', true);

DO $boundary$
DECLARE
  role_name text := current_setting('falcon.runtime_role');
  database_name text := current_setting('falcon.runtime_database');
  schema_name text := current_setting('falcon.runtime_schema');
  runtime_oid oid;
  schema_oid oid;
  role_row record;
  relation_row record;
  column_row record;
  table_policy jsonb;
  update_columns text[];
  update_column_sql text;
  -- Exact companion matrix to LIMITED_BUSINESS_TABLES in runtime-start.cjs.
  -- Unlike the compatibility launcher, this job requires every listed table.
  limited_business_tables constant jsonb := '{
    "department_leadership": {"insert": true, "update_columns": ["structure", "higher_officer_id", "revision", "dean_enabled", "dean_user_id"]},
    "department_offices": {"insert": true, "update_columns": ["login_alias"]},
    "department_office_appointments": {"insert": true, "update_columns": ["valid_to"]},
    "department_office_session_revisions": {"insert": true, "update_columns": ["revision"]},
    "department_leadership_events": {"insert": true, "update_columns": []},
    "student_identity_email_changes": {"insert": false, "update_columns": []},
    "hr_department_request_routes": {"insert": true, "update_columns": ["approver_ids", "current_index", "leadership_revision", "updated_at"]},
    "department_leadership_changes": {"insert": true, "update_columns": []},
    "hr_staff_request_appeals": {"insert": true, "update_columns": ["rejecting_user_id", "reviewer_user_id", "status", "reconsideration_count", "revision", "updated_at"]},
    "hr_staff_request_appeal_events": {"insert": true, "update_columns": []},
    "academic_attendance_reopen_requests": {"insert": true, "update_columns": ["status", "decided_by", "decided_at", "decision_reason", "revision", "expires_at"]},
    "academic_attendance_correction_audit": {"insert": true, "update_columns": []},
    "academic_event_class_cohorts": {"insert": true, "update_columns": ["status", "decided_by", "decided_at", "decision_reason", "revision", "attendance_data", "attendance_marked_at", "attendance_marked_by"]},
    "academic_event_class_audit": {"insert": true, "update_columns": []},
    "exam_question_paper_versions": {"insert": true, "update_columns": []},
    "exam_script_discrepancies": {"insert": true, "update_columns": ["status", "reason", "reported_by", "reported_at", "resolution", "resolution_reason", "resolved_by", "resolved_at"]}
  }'::jsonb;
BEGIN
  IF role_name <> 'falcon_runtime' THEN
    RAISE EXCEPTION 'Scoped leadership grants require existing falcon_runtime';
  END IF;
  IF schema_name <> 'public' OR current_database() <> database_name THEN
    RAISE EXCEPTION 'Wrong target: connect to the explicit reviewed database/public';
  END IF;
  IF current_setting('server_version_num')::integer < 180000 OR
     current_setting('server_version_num')::integer >= 190000 THEN
    RAISE EXCEPTION 'PostgreSQL 18 is required for the reviewed MAINTAIN boundary';
  END IF;
  SELECT * INTO role_row FROM pg_roles WHERE rolname = role_name;
  IF NOT FOUND OR NOT role_row.rolcanlogin OR role_row.rolsuper OR
     role_row.rolcreatedb OR role_row.rolcreaterole OR role_row.rolreplication OR
     role_row.rolbypassrls OR role_name = current_user THEN
    RAISE EXCEPTION 'Use a separate existing unprivileged LOGIN runtime role';
  END IF;
  runtime_oid := role_row.oid;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = runtime_oid) THEN
    RAISE EXCEPTION 'Runtime role membership requires separate review';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_database WHERE datdba = runtime_oid) OR
     EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = runtime_oid) OR
     EXISTS (SELECT 1 FROM pg_class WHERE relowner = runtime_oid) OR
     EXISTS (SELECT 1 FROM pg_proc WHERE proowner = runtime_oid) OR
     EXISTS (SELECT 1 FROM pg_type WHERE typowner = runtime_oid) THEN
    RAISE EXCEPTION 'Runtime must not own databases, schemas or persistent objects';
  END IF;
  SELECT oid INTO schema_oid FROM pg_namespace WHERE nspname = schema_name;
  IF schema_oid IS NULL OR to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Existing reviewed application schema and migration ledger are required';
  END IF;
  IF has_database_privilege(runtime_oid, database_name, 'CREATE') OR
     EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND
       n.nspname <> 'information_schema' AND has_schema_privilege(runtime_oid,n.oid,'CREATE')) THEN
    RAISE EXCEPTION 'Existing runtime has database/schema CREATE; scoped grants refused';
  END IF;
  IF NOT has_database_privilege(runtime_oid,database_name,'CONNECT') OR
     NOT has_schema_privilege(runtime_oid,schema_oid,'USAGE') OR
     NOT has_table_privilege(runtime_oid,'public.schema_migrations','SELECT') OR
     has_table_privilege(runtime_oid,'public.schema_migrations','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR
     has_any_column_privilege(runtime_oid,'public.schema_migrations','INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'Existing runtime schema/ledger access is outside its protected boundary';
  END IF;
  -- Reject pre-existing delegation rather than concealing it during narrowing.
  IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE a.grantee = runtime_oid AND a.is_grantable) OR
     EXISTS (SELECT 1 FROM pg_attribute t CROSS JOIN LATERAL aclexplode(t.attacl) a
       WHERE a.grantee = runtime_oid AND a.is_grantable) OR
     EXISTS (SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
       WHERE a.grantee = runtime_oid AND a.is_grantable) OR
     EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
       WHERE a.grantee = runtime_oid AND a.is_grantable) OR
     EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
       WHERE a.grantee = runtime_oid AND a.is_grantable) THEN
    RAISE EXCEPTION 'Runtime privilege delegation requires separate review';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_parameter_acl p
       WHERE has_parameter_privilege(runtime_oid, p.parname, 'SET,ALTER SYSTEM')) THEN
    RAISE EXCEPTION 'Runtime has an elevated configuration-parameter grant';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = schema_oid AND
       (c.relrowsecurity OR c.relforcerowsecurity OR c.relkind = 'f')) THEN
    RAISE EXCEPTION 'RLS or foreign-table compatibility requires separate review';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = schema_oid
       AND limited_business_tables ? c.relname AND c.relkind <> 'r') THEN
    RAISE EXCEPTION 'A limited business relation has an unexpected relation kind';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.prosecdef AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
         AND has_function_privilege(runtime_oid, p.oid, 'EXECUTE')) OR
     EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
       JOIN pg_class c ON c.oid = t.tgrelid
       WHERE c.relnamespace = schema_oid AND p.prosecdef) THEN
    RAISE EXCEPTION 'SECURITY DEFINER access or triggers require separate review';
  END IF;
  IF (SELECT count(*) FROM pg_class c WHERE c.relnamespace=schema_oid
        AND limited_business_tables ? c.relname AND c.relkind='r') <>
       (SELECT count(*) FROM jsonb_object_keys(limited_business_tables)) THEN
    RAISE EXCEPTION 'All exact limited tables must exist before scoped grants';
  END IF;

  FOR relation_row IN SELECT c.oid,c.relname,c.relkind FROM pg_class c
       WHERE c.relnamespace=schema_oid AND limited_business_tables ? c.relname LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                   schema_name, relation_row.relname, role_name);
    table_policy := limited_business_tables -> relation_row.relname;
    IF table_policy IS NOT NULL THEN
      -- Table REVOKE does not remove separate column ACLs. Normalize only this
      -- role's exact limited-table columns; never revoke PUBLIC or another role.
      FOR column_row IN SELECT a.attname FROM pg_attribute a
           WHERE a.attrelid=relation_row.oid AND a.attnum>0 AND NOT a.attisdropped LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE %I.%I FROM %I',
                       column_row.attname, schema_name, relation_row.relname, role_name);
      END LOOP;
      SELECT coalesce(array_agg(value), ARRAY[]::text[]) INTO update_columns
        FROM jsonb_array_elements_text(table_policy -> 'update_columns');
      IF EXISTS (SELECT 1 FROM unnest(update_columns) wanted(column_name)
           WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
             WHERE a.attrelid=relation_row.oid AND a.attnum>0 AND NOT a.attisdropped
               AND a.attname=wanted.column_name)) THEN
        RAISE EXCEPTION 'A required limited business update column is missing';
      END IF;
      EXECUTE format('GRANT SELECT ON TABLE %I.%I TO %I',
                     schema_name, relation_row.relname, role_name);
      IF (table_policy ->> 'insert')::boolean THEN
        EXECUTE format('GRANT INSERT ON TABLE %I.%I TO %I',
                       schema_name, relation_row.relname, role_name);
      END IF;
      IF cardinality(update_columns)>0 THEN
        SELECT string_agg(quote_ident(value), ',') INTO update_column_sql
          FROM unnest(update_columns) value;
        EXECUTE format('GRANT UPDATE (%s) ON TABLE %I.%I TO %I',
                       update_column_sql, schema_name, relation_row.relname, role_name);
      END IF;
      -- Effective checks also see PUBLIC/inherited and column-level grants.
      -- A conflicting external grant refuses and rolls back this transaction.
      IF NOT has_table_privilege(runtime_oid, relation_row.oid, 'SELECT') OR
         has_table_privilege(runtime_oid, relation_row.oid, 'INSERT') <>
           (table_policy ->> 'insert')::boolean OR
         (NOT (table_policy ->> 'insert')::boolean AND
           has_any_column_privilege(runtime_oid, relation_row.oid, 'INSERT')) OR
         has_table_privilege(runtime_oid, relation_row.oid, 'UPDATE,DELETE') OR
         EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=relation_row.oid
           AND a.attnum>0 AND NOT a.attisdropped AND NOT (a.attname=ANY(update_columns))
           AND has_column_privilege(runtime_oid, relation_row.oid, a.attnum, 'UPDATE')) OR
         EXISTS (SELECT 1 FROM unnest(update_columns) wanted(column_name)
           WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
             WHERE a.attrelid=relation_row.oid AND a.attnum>0 AND NOT a.attisdropped
               AND a.attname=wanted.column_name
               AND has_column_privilege(runtime_oid, relation_row.oid, a.attnum, 'UPDATE'))) THEN
        RAISE EXCEPTION 'Unexpected effective limited business privileges';
      END IF;
    END IF;
    IF has_table_privilege(runtime_oid,relation_row.oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR
       has_any_column_privilege(runtime_oid,relation_row.oid,'REFERENCES') THEN
      RAISE EXCEPTION 'Unexpected elevated effective leadership privileges remain';
    END IF;
  END LOOP;
END
$boundary$;
COMMIT;
