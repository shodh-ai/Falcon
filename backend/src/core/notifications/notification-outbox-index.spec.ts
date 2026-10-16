import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('review-only notification outbox index', () => {
  const notificationScripts = resolve(
    __dirname,
    '../../../scripts/notifications',
  );
  const reviewedFile = readFileSync(
    resolve(notificationScripts, 'outbox-index.review.sql'),
    'utf8',
  );
  const preflight = readFileSync(
    resolve(notificationScripts, 'outbox-index.preflight.review.sql'),
    'utf8',
  );
  const postflight = readFileSync(
    resolve(notificationScripts, 'outbox-index.postflight.review.sql'),
    'utf8',
  );
  const checklist = readFileSync(
    resolve(__dirname, '../../../docs/notification-release-checklist.md'),
    'utf8',
  );
  const sql = reviewedFile.replace(/^--.*$/gm, '').trim();
  it('contains only one additive concurrent index statement', () => {
    expect(sql.split(';').filter((statement) => statement.trim())).toHaveLength(
      1,
    );
    expect(sql).toMatch(
      /^CREATE INDEX CONCURRENTLY idx_falcon_notifications_email_outbox/,
    );
    expect(sql).toContain('ON public.falcon_notifications');
    expect(sql).not.toMatch(
      /\b(DROP|ALTER|INSERT|UPDATE|DELETE|BEGIN|COMMIT)\b/i,
    );
  });
  it('fails closed on an existing index name and requires standalone catalog verification', () => {
    expect(sql).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
    expect(reviewedFile).toContain('dedicated autocommit connection');
    expect(reviewedFile).toContain('never db:migrate or psql -1');
    expect(reviewedFile).toContain('i.indisvalid, i.indisready');
    expect(reviewedFile).toContain(
      'i.indislive, pg_get_indexdef(i.indexrelid)',
    );
    expect(reviewedFile).toContain('no existing same-name object');
    expect(reviewedFile).toContain('do not automatically drop/recreate');
  });
  it('indexes the same activation keys, priority and pending states as reconciliation', () => {
    expect(sql).toContain("metadata->'emailDelivery'->>'queuePrefix'");
    expect(sql).toContain("metadata->'emailDelivery'->>'activatedAfter'");
    expect(sql).toContain('THEN 0 ELSE 1 END');
    expect(sql).toContain("IN ('pending', 'queued')");
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).not.toMatch(/sending|accepted|review_required/);
  });
  it.each([
    ['preflight', preflight],
    ['postflight', postflight],
  ])(
    'keeps %s catalog-only with explicit identity and nonzero refusal',
    (_name, file) => {
      const statements = file
        .replace(/^--.*$/gm, '')
        .replace(/^\s*\\.*$/gm, '');
      expect(statements).not.toMatch(
        /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|BEGIN|COMMIT|COPY|CALL|DO)\b/i,
      );
      expect(file).toContain('\\set ON_ERROR_STOP on');
      expect(file).toContain('\\set AUTOCOMMIT on');
      expect(file).toContain('SET default_transaction_read_only = on');
      for (const variable of [
        'expected_database',
        'expected_server_addr',
        'expected_server_port',
        'expected_owner_role',
      ]) {
        expect(file).toContain(`\\if :{?${variable}}`);
        expect(file).toContain(`:'${variable}'`);
      }
      expect(file).toContain('session_user = current_user');
      expect(file).toContain(
        "current_database() = 'falcon_notification_staging'",
      );
      expect(file).toContain("current_user = 'notification_staging_owner'");
      expect(file).toContain("inet_server_addr() = '172.30.71.2'::inet");
      expect(file).toContain(
        "inet_server_addr() = :'expected_server_addr'::inet",
      );
      expect(file).not.toContain(
        "inet_server_addr()::text = :'expected_server_addr'",
      );
      expect(file).toContain('inet_server_port() = 5432');
      expect(file).toContain("c.relname = 'notification_staging_environment'");
      expect(file).toContain(
        "pg_get_userbyid(c.relowner) = 'notification_staging_owner'",
      );
      expect(file).toContain('SELECT COUNT(*) = 1 AND BOOL_AND(');
      expect(file).toContain(
        "id IS TRUE AND environment = 'falcon-notification-staging' AND version = 1",
      );
      expect(file).toContain('FROM public.notification_staging_environment');
      expect(file).toContain('\\if :staging_marker_matches');
      expect(file).toContain('NOT pg_is_in_recovery()');
      expect(file).toContain("current_setting('transaction_read_only') = 'on'");
      expect(file).toContain('SELECT 1 / 0 AS staging_index_gate_rejected;');
      expect(file).not.toMatch(/\\(?:q|quit)\b/);
      expect(file).not.toContain('default_transaction_read_only = off');
    },
  );
  it('checks ordinary table ownership, typed columns and all relation-name collisions before DDL', () => {
    expect(preflight).toContain("c.relkind = 'r'");
    expect(preflight).toContain('pg_get_userbyid(c.relowner) = current_user');
    expect(preflight).toContain('FROM pg_inherits');
    expect(preflight).toContain("('notification_id', 'uuid'::regtype, true)");
    expect(preflight).toContain("('created_at', 'timestamptz'::regtype, true)");
    expect(preflight).toContain(
      "('deleted_at', 'timestamptz'::regtype, false)",
    );
    expect(preflight).toContain("('metadata', 'jsonb'::regtype, false)");
    expect(preflight).toContain('a.attnotnull <> expected.not_null');
    const collisionGuard = preflight.split('-- pg_class includes')[1];
    expect(collisionGuard).toContain('FROM pg_class');
    expect(collisionGuard).not.toContain('FROM pg_index');
    expect(collisionGuard).toContain('\\if :index_name_available');
  });
  it('verifies actual index catalog state and requires an exact owner definition review', () => {
    expect(postflight).toContain(
      'i.indisvalid AND i.indisready AND i.indislive',
    );
    expect(postflight).toContain('i.indnkeyatts = 5 AND i.indnatts = 5');
    expect(postflight).toContain('NOT i.indisunique AND NOT i.indisprimary');
    expect(postflight).toContain("am.amname = 'btree'");
    expect(postflight).toContain('pg_get_indexdef(i.indexrelid)');
    expect(postflight).toContain('pg_get_expr(i.indpred, i.indrelid)');
    for (let key = 1; key <= 5; key += 1) {
      expect(postflight).toContain(
        `pg_get_indexdef(i.indexrelid, ${key}, true)`,
      );
    }
    expect(postflight).toContain('Owner must compare every key/predicate');
  });
  it('documents one guarded autocommit connection without migration or transaction wrapping', () => {
    expect(checklist).toContain('psql -X --set=ON_ERROR_STOP=on');
    expect(checklist).toContain('${STAGING_INDEX_SERVICE:?');
    expect(checklist).toContain('${STAGING_INDEX_PGPASSFILE:?');
    expect(checklist).toContain(
      '--file=scripts/notifications/outbox-index.preflight.review.sql',
    );
    expect(checklist).toContain(
      '--file=scripts/notifications/outbox-index.postflight.review.sql',
    );
    expect(checklist).toContain('on one connection with autocommit enabled');
    expect(checklist).toContain('matching SQL fields alone do');
    expect(checklist).toContain(
      'not prove that an endpoint belongs to staging',
    );
    expect(checklist).toContain('without\n`ANALYZE`');
  });
});
