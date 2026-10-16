-- REVIEW ONLY: fresh falcon_notification_staging only, through bootstrap.cjs.
-- No transaction wrapper, roles, extensions, account fixtures or outbox index here.
CREATE TABLE public.notification_staging_environment (
  id boolean NOT NULL,
  environment text NOT NULL,
  version integer NOT NULL,
  CONSTRAINT notification_stage_marker_pk PRIMARY KEY (id),
  CONSTRAINT notification_stage_marker_id CHECK (id),
  CONSTRAINT notification_stage_marker_environment CHECK (environment = 'falcon-notification-staging'),
  CONSTRAINT notification_stage_marker_version CHECK (version = 1)
);
INSERT INTO public.notification_staging_environment (id,environment,version) VALUES (true,'falcon-notification-staging',1);
CREATE TABLE public.tenants (
  tenant_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  name varchar(255) NOT NULL,
  subdomain varchar(63) NOT NULL,
  custom_domain varchar(255),
  pg_schema varchar(63) NOT NULL,
  primary_color varchar(7) NOT NULL DEFAULT '#08234a',
  accent_color varchar(7) NOT NULL DEFAULT '#d6b65d',
  logo_url varchar(512),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT notification_stage_tenant_pk PRIMARY KEY (tenant_id),
  CONSTRAINT notification_stage_tenant_subdomain_uq UNIQUE (subdomain)
);
CREATE TABLE public.tenant_subscriptions (
  subscription_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL,
  feature_key varchar(64) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  expires_at date,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT notification_stage_subscription_pk PRIMARY KEY (subscription_id),
  CONSTRAINT notification_stage_subscription_uq UNIQUE (tenant_id,feature_key),
  CONSTRAINT notification_stage_subscription_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (tenant_id) ON DELETE CASCADE
);
CREATE TABLE public.roles (
  role_id serial NOT NULL,
  role_name varchar(50) NOT NULL,
  description text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT notification_stage_role_pk PRIMARY KEY (role_id),
  CONSTRAINT notification_stage_role_name_uq UNIQUE (role_name)
);
CREATE TABLE public.campuses (
  campus_id serial NOT NULL,
  campus_name varchar(100) NOT NULL,
  campus_code varchar(20),
  address text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT notification_stage_campus_pk PRIMARY KEY (campus_id),
  CONSTRAINT notification_stage_campus_name_uq UNIQUE (campus_name)
);
CREATE TABLE public.schools (
  school_id serial NOT NULL,
  school_name varchar(150) NOT NULL,
  school_code varchar(20),
  campus_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT notification_stage_school_pk PRIMARY KEY (school_id),
  CONSTRAINT notification_stage_school_campus_fk FOREIGN KEY (campus_id) REFERENCES public.campuses (campus_id) ON DELETE NO ACTION
);
CREATE INDEX notification_stage_school_campus_idx ON public.schools (campus_id);
CREATE TABLE public.departments (
  dept_id serial NOT NULL,
  dept_name varchar(100) NOT NULL,
  description text,
  hod_user_id uuid,
  school_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT notification_stage_department_pk PRIMARY KEY (dept_id),
  CONSTRAINT notification_stage_department_name_uq UNIQUE (dept_name),
  CONSTRAINT notification_stage_department_school_fk FOREIGN KEY (school_id) REFERENCES public.schools (school_id) ON DELETE SET NULL
);
CREATE TABLE public.org_entities (
  entity_id serial NOT NULL,
  tenant_id uuid NOT NULL,
  entity_code varchar(64) NOT NULL,
  entity_name varchar(255) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_stage_entity_pk PRIMARY KEY (entity_id),
  CONSTRAINT notification_stage_entity_code_uq UNIQUE (tenant_id,entity_code),
  CONSTRAINT notification_stage_entity_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (tenant_id) ON DELETE CASCADE
);
CREATE INDEX notification_stage_entity_tenant_idx ON public.org_entities (tenant_id);
CREATE TABLE public.users (
  user_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name varchar(255) NOT NULL,
  official_email varchar(255) NOT NULL,
  role_id integer,
  dept_id integer,
  entity_id integer,
  reporting_officer_id uuid,
  google_id varchar(255),
  password_hash varchar(255),
  salary_base numeric(12,2),
  is_active boolean NOT NULL DEFAULT true,
  onboarding_status varchar(50),
  account_status varchar(32),
  phone varchar(20),
  expo_push_token varchar(255),
  onboarding_profile jsonb,
  last_login_at timestamptz,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT notification_stage_user_pk PRIMARY KEY (user_id),
  CONSTRAINT notification_stage_user_email_uq UNIQUE (official_email),
  CONSTRAINT notification_stage_user_tenant_email_uq UNIQUE (tenant_id,official_email),
  CONSTRAINT notification_stage_user_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (tenant_id) ON DELETE NO ACTION,
  CONSTRAINT notification_stage_user_role_fk FOREIGN KEY (role_id) REFERENCES public.roles (role_id) ON DELETE NO ACTION,
  CONSTRAINT notification_stage_user_department_fk FOREIGN KEY (dept_id) REFERENCES public.departments (dept_id) ON DELETE NO ACTION,
  CONSTRAINT notification_stage_user_entity_fk FOREIGN KEY (entity_id) REFERENCES public.org_entities (entity_id) ON DELETE NO ACTION,
  CONSTRAINT notification_stage_user_reporting_fk FOREIGN KEY (reporting_officer_id) REFERENCES public.users (user_id) ON DELETE NO ACTION
);
ALTER TABLE public.departments ADD CONSTRAINT notification_stage_department_hod_fk FOREIGN KEY (hod_user_id) REFERENCES public.users (user_id) ON DELETE SET NULL;
CREATE INDEX notification_stage_user_tenant_idx ON public.users (tenant_id);
CREATE INDEX notification_stage_user_role_idx ON public.users (role_id);
CREATE INDEX notification_stage_user_department_idx ON public.users (dept_id);
CREATE INDEX notification_stage_user_google_idx ON public.users (google_id);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role_id integer NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  CONSTRAINT notification_stage_user_role_pk PRIMARY KEY (user_id,role_id),
  CONSTRAINT notification_stage_user_role_user_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE CASCADE,
  CONSTRAINT notification_stage_user_role_role_fk FOREIGN KEY (role_id) REFERENCES public.roles (role_id) ON DELETE CASCADE
);
CREATE TABLE public.user_entity_access (
  access_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_id integer NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by_user_id uuid,
  CONSTRAINT notification_stage_entity_access_pk PRIMARY KEY (access_id),
  CONSTRAINT notification_stage_entity_access_uq UNIQUE (user_id,entity_id),
  CONSTRAINT notification_stage_entity_access_user_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE CASCADE,
  CONSTRAINT notification_stage_entity_access_entity_fk FOREIGN KEY (entity_id) REFERENCES public.org_entities (entity_id) ON DELETE CASCADE,
  CONSTRAINT notification_stage_entity_access_grantor_fk FOREIGN KEY (granted_by_user_id) REFERENCES public.users (user_id) ON DELETE SET NULL
);
CREATE TABLE public.hr_permissions (
  permission_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_stage_hr_permission_pk PRIMARY KEY (permission_id),
  CONSTRAINT notification_stage_hr_permission_uq UNIQUE (tenant_id,user_id),
  CONSTRAINT notification_stage_hr_permission_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (tenant_id) ON DELETE CASCADE,
  CONSTRAINT notification_stage_hr_permission_user_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE CASCADE,
  CONSTRAINT notification_stage_hr_permission_updater_fk FOREIGN KEY (updated_by_user_id) REFERENCES public.users (user_id) ON DELETE SET NULL
);
CREATE TABLE public.hr_access_controls (
  access_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  module_name varchar(64) NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  department_scope integer[],
  entity_scope integer[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_stage_hr_control_pk PRIMARY KEY (access_id),
  CONSTRAINT notification_stage_hr_control_uq UNIQUE (tenant_id,user_id,module_name),
  CONSTRAINT notification_stage_hr_control_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (tenant_id) ON DELETE CASCADE,
  CONSTRAINT notification_stage_hr_control_user_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE CASCADE
);
CREATE TABLE public.admin_login_history (
  login_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  email varchar(255),
  ip_address varchar(64),
  user_agent text,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_stage_login_pk PRIMARY KEY (login_id),
  CONSTRAINT notification_stage_login_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (tenant_id) ON DELETE NO ACTION,
  CONSTRAINT notification_stage_login_user_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE NO ACTION
);
CREATE TABLE public.admin_control_audit (
  audit_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL,
  actor_user_id uuid,
  action varchar(64) NOT NULL,
  resource_type varchar(64) NOT NULL,
  resource_id varchar(128),
  details jsonb,
  ip_address varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_stage_audit_pk PRIMARY KEY (audit_id),
  CONSTRAINT notification_stage_audit_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (tenant_id) ON DELETE NO ACTION,
  CONSTRAINT notification_stage_audit_actor_fk FOREIGN KEY (actor_user_id) REFERENCES public.users (user_id) ON DELETE NO ACTION
);
CREATE TABLE public.falcon_notifications (
  notification_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category varchar(50) NOT NULL,
  title varchar(255) NOT NULL,
  message text NOT NULL,
  action_link varchar(255),
  severity varchar(20) NOT NULL DEFAULT 'info',
  intent varchar(30) NOT NULL DEFAULT 'info',
  action_label varchar(100),
  metadata jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT notification_stage_notification_pk PRIMARY KEY (notification_id),
  CONSTRAINT notification_stage_notification_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (tenant_id) ON DELETE NO ACTION,
  CONSTRAINT notification_stage_notification_user_fk FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE CASCADE
);
CREATE INDEX notification_stage_notification_owner_idx ON public.falcon_notifications (user_id,created_at);
