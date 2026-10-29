-- Expand only. No department is opted in and no person/email/password is changed.
-- The migration runner owns the schema-and-ledger transaction.
CREATE TABLE IF NOT EXISTS department_office_session_revisions (
 tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
 user_id uuid NOT NULL REFERENCES users(user_id),
 revision integer NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS department_leadership (
 tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
 dept_id integer NOT NULL REFERENCES departments(dept_id),
 structure varchar(24) NOT NULL CHECK(structure IN ('HOD_ONLY','PRINCIPAL_ONLY','PRINCIPAL_HOD')),
 higher_officer_id uuid REFERENCES users(user_id),
 revision integer NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant_id,dept_id)
);
CREATE TABLE IF NOT EXISTS department_offices (
 office_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
 dept_id integer NOT NULL,
 kind varchar(16) NOT NULL CHECK(kind IN ('PRINCIPAL','HOD')),
 login_alias text NOT NULL CHECK(login_alias=lower(login_alias)),
 UNIQUE(tenant_id,dept_id,kind), UNIQUE(tenant_id,login_alias),
 FOREIGN KEY(tenant_id,dept_id) REFERENCES department_leadership(tenant_id,dept_id)
);
CREATE TABLE IF NOT EXISTS department_office_appointments (
 appointment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES department_offices(office_id),
 user_id uuid NOT NULL REFERENCES users(user_id),
 valid_from timestamptz NOT NULL DEFAULT now(),
 valid_to timestamptz,
 assigned_by uuid NOT NULL REFERENCES users(user_id),
 CHECK(valid_to IS NULL OR valid_to>=valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS department_office_one_holder ON department_office_appointments(office_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS department_office_holder ON department_office_appointments(user_id) WHERE valid_to IS NULL;
CREATE TABLE IF NOT EXISTS department_leadership_events (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
 dept_id integer NOT NULL REFERENCES departments(dept_id),
 actor_user_id uuid NOT NULL REFERENCES users(user_id),
 action text NOT NULL, details jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS student_identity_email_changes (
 tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
 user_id uuid NOT NULL REFERENCES users(user_id),
 student_login_id text NOT NULL, old_email text, new_email text NOT NULL,
 mailbox_provisioned boolean NOT NULL DEFAULT false,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id)
);
