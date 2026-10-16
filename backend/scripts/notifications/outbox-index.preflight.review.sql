-- REVIEW ONLY: read-only preflight for an independently approved STAGING target.
-- Never run automatically, through db:migrate, or against a production service.
-- Supply all four expected_* values from the owner's approved target inventory.
-- Connection credentials belong in a protected PGSERVICE/PGPASSFILE, not this file.
\set ON_ERROR_STOP on
\set AUTOCOMMIT on
\if :{?expected_database}
\else
  \echo 'STOP: expected_database is required.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif
\if :{?expected_server_addr}
\else
  \echo 'STOP: expected_server_addr is required.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif
\if :{?expected_server_port}
\else
  \echo 'STOP: expected_server_port is required.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif
\if :{?expected_owner_role}
\else
  \echo 'STOP: expected_owner_role is required.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif

-- Session setting only; every catalog statement below runs read-only.
SET default_transaction_read_only = on;

SELECT current_database() = 'falcon_notification_staging'
       AND current_user = 'notification_staging_owner'
       AND inet_server_addr() = '172.30.71.2'::inet
       AND inet_server_port() = 5432
       AND current_database() = :'expected_database'
       AND inet_server_addr() = :'expected_server_addr'::inet
       AND inet_server_port()::text = :'expected_server_port'
       AND current_user = :'expected_owner_role'
       AND session_user = current_user
       AND NOT pg_is_in_recovery()
       AND current_setting('transaction_read_only') = 'on'
       AS target_matches
\gset
\if :target_matches
\else
  \echo 'STOP: staging database/server/owner identity does not match.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif

-- Positive owner-provisioned marker: caller-supplied expected_* variables alone
-- can never authorize a different database, role or deployment environment.
SELECT EXISTS (
  SELECT 1 FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public'
    AND c.relname = 'notification_staging_environment' AND c.relkind = 'r'
    AND pg_get_userbyid(c.relowner) = 'notification_staging_owner'
    AND NOT EXISTS (
      SELECT 1 FROM pg_inherits h
      WHERE h.inhrelid = c.oid OR h.inhparent = c.oid
    )
) AS marker_table_matches
\gset
\if :marker_table_matches
\else
  \echo 'STOP: dedicated owner-provisioned staging marker table is required.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif

SELECT COUNT(*) = 1 AND BOOL_AND(
  id IS TRUE AND environment = 'falcon-notification-staging' AND version = 1
) AS staging_marker_matches
FROM public.notification_staging_environment
\gset
\if :staging_marker_matches
\else
  \echo 'STOP: exact single-row positive notification staging marker required.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif

SELECT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relname = 'falcon_notifications'
    AND c.relkind = 'r' AND pg_get_userbyid(c.relowner) = current_user
    AND NOT EXISTS (
      SELECT 1 FROM pg_inherits h
      WHERE h.inhrelid = c.oid OR h.inhparent = c.oid
    )
) AS table_matches
\gset
\if :table_matches
\else
  \echo 'STOP: expected owner-owned ordinary, non-inherited table is required.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM (VALUES
    ('notification_id', 'uuid'::regtype, true),
    ('tenant_id', 'uuid'::regtype, true),
    ('user_id', 'uuid'::regtype, true),
    ('created_at', 'timestamptz'::regtype, true),
    ('deleted_at', 'timestamptz'::regtype, false),
    ('metadata', 'jsonb'::regtype, false)
  ) AS expected(name, type_oid, not_null)
  LEFT JOIN pg_attribute a
    ON a.attrelid = 'public.falcon_notifications'::regclass
    AND a.attname = expected.name AND a.attnum > 0 AND NOT a.attisdropped
  WHERE a.attname IS NULL OR a.atttypid <> expected.type_oid
    OR a.attnotnull <> expected.not_null
) AS columns_match
\gset
\if :columns_match
\else
  \echo 'STOP: notification column types/nullability differ from reviewed schema.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif

-- pg_class includes indexes, tables, views, sequences and invalid indexes.
SELECT NOT EXISTS (
  SELECT 1 FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public'
    AND c.relname = 'idx_falcon_notifications_email_outbox'
) AS index_name_available
\gset
\if :index_name_available
\else
  \echo 'STOP: same-name relation exists; owner review required, never auto-drop.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif

\echo 'Preflight passed for this connection only. No schema change was made.'
