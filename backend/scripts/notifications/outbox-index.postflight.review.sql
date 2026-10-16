-- REVIEW ONLY: read-only postflight. Use the same approved connection as preflight.
-- Identity was checked by preflight; repeat all expected values and identity checks
-- here so this file also fails closed if invoked independently.
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
  FROM pg_class idx
  JOIN pg_namespace ns ON ns.oid = idx.relnamespace
  JOIN pg_index i ON i.indexrelid = idx.oid
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_namespace tblns ON tblns.oid = tbl.relnamespace
  JOIN pg_am am ON am.oid = idx.relam
  WHERE ns.nspname = 'public'
    AND idx.relname = 'idx_falcon_notifications_email_outbox'
    AND idx.relkind = 'i' AND tbl.relkind = 'r'
    AND tblns.nspname = 'public' AND tbl.relname = 'falcon_notifications'
    AND pg_get_userbyid(tbl.relowner) = current_user
    AND pg_get_userbyid(idx.relowner) = current_user
    AND am.amname = 'btree'
    AND i.indisvalid AND i.indisready AND i.indislive
    AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion
    AND i.indnkeyatts = 5 AND i.indnatts = 5
    AND i.indpred IS NOT NULL
) AS index_usable
\gset
\if :index_usable
\else
  \echo 'STOP: index shape, ownership, table or validity differs from review.'
  SELECT 1 / 0 AS staging_index_gate_rejected;
\endif

-- Output definitions for an explicit owner comparison; do not treat a matching
-- name/validity flag or five keys as proof that expressions/predicate match.
SELECT pg_get_indexdef(i.indexrelid) AS index_definition,
       pg_get_expr(i.indpred, i.indrelid) AS partial_predicate,
       pg_get_indexdef(i.indexrelid, 1, true) AS queue_prefix_key,
       pg_get_indexdef(i.indexrelid, 2, true) AS activation_key,
       pg_get_indexdef(i.indexrelid, 3, true) AS priority_key,
       pg_get_indexdef(i.indexrelid, 4, true) AS created_at_key,
       pg_get_indexdef(i.indexrelid, 5, true) AS notification_id_key
FROM pg_index i
JOIN pg_class idx ON idx.oid = i.indexrelid
JOIN pg_namespace ns ON ns.oid = idx.relnamespace
WHERE ns.nspname = 'public'
  AND idx.relname = 'idx_falcon_notifications_email_outbox';

\echo 'Catalog flags passed. Owner must compare every key/predicate with reviewed SQL.'
\echo 'Staging query-plan and synthetic-data checks remain required. No writes made here.'
