-- REVIEW ONLY. Never called by startup or the migration runner.
-- Requires separate database-owner approval and target/catalog verification.
-- PostgreSQL CREATE INDEX CONCURRENTLY must run outside a transaction.
-- Execute through a dedicated autocommit connection, never db:migrate or psql -1.
-- Before execution, verify the intended database/server and public table columns.
-- Inspect the index name with the following read-only catalog query before and
-- after execution (a pre-existing name requires review; do not silently skip it):
-- SELECT ns.nspname, tbl.relname, idx.relname, i.indisvalid, i.indisready,
--        i.indislive, pg_get_indexdef(i.indexrelid)
-- FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid
-- JOIN pg_namespace ns ON ns.oid = idx.relnamespace
-- JOIN pg_class tbl ON tbl.oid = i.indrelid
-- WHERE ns.nspname = 'public'
--   AND idx.relname = 'idx_falcon_notifications_email_outbox';
-- Precondition: no existing same-name object (including a failed/invalid index).
-- Postcondition: exactly one valid, ready, live index on falcon_notifications,
-- with pg_get_indexdef matching the expressions/predicate reviewed below.
-- A failed concurrent build may leave an invalid index. Stop for owner review;
-- do not automatically drop/recreate it or retry with IF NOT EXISTS.
CREATE INDEX CONCURRENTLY idx_falcon_notifications_email_outbox
ON public.falcon_notifications (
  (metadata->'emailDelivery'->>'queuePrefix'),
  (metadata->'emailDelivery'->>'activatedAfter'),
  (CASE WHEN metadata->'emailDelivery'->>'state' = 'pending' THEN 0 ELSE 1 END),
  created_at,
  notification_id
)
WHERE deleted_at IS NULL
  AND metadata->'emailDelivery'->>'state' IN ('pending', 'queued');
