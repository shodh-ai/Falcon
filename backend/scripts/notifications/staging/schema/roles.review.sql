-- MANUAL ADMIN REVIEW ONLY. Not allowlisted by bootstrap.cjs and never auto-run.
-- Requires separate fresh-container/database/role provisioning approval.
-- No passwords here. A privileged owner must provision NEW credentials privately.
BEGIN;
DO $review$
BEGIN
  IF current_database() <> 'falcon_notification_staging'
     OR current_user <> 'notification_staging_bootstrap'
     OR inet_server_addr() IS DISTINCT FROM '172.30.71.2'::inet
     OR inet_server_port() IS DISTINCT FROM 5432
     OR current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999
     OR EXISTS(SELECT 1 FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres','falcon_notification_staging'))
     OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('notification_staging_owner','notification_staging_app'))
     OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
     OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
     OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')
     OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema'))
     OR EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql') THEN
    RAISE EXCEPTION 'Fresh isolated notification staging administration target required';
  END IF;
END;
$review$;
CREATE ROLE notification_staging_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
CREATE ROLE notification_staging_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
ALTER DATABASE falcon_notification_staging OWNER TO notification_staging_owner;
ALTER SCHEMA public OWNER TO notification_staging_owner;
REVOKE ALL ON DATABASE falcon_notification_staging FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE falcon_notification_staging TO notification_staging_owner;
COMMENT ON DATABASE falcon_notification_staging IS 'falcon-notification-staging:approved-empty-v1';
COMMIT;
-- Stop here. Roles have no password and cannot authenticate over the approved
-- SCRAM host connection until the admin provisions NEW credentials privately.
-- Never put credentials in this file, command arguments, shell history or chat.
