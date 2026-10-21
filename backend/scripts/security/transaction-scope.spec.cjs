'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

test(
  'PostgreSQL scopes legacy NULL-tenant payments through consistent ownership without rewriting them',
  { skip: process.env.FALCON_SYNTHETIC_DB !== '1' },
  async () => {
    assert.equal(
      process.env.NODE_ENV,
      'test',
      'Synthetic DB tests require NODE_ENV=test',
    );
    assert.match(
      process.env.DB_DATABASE || '',
      /^falcon_test(?:_[a-z0-9_]+)?$/,
      'Refusing a non-test database',
    );
    assert.ok(
      ['localhost', '127.0.0.1', 'postgres'].includes(process.env.DB_HOST),
      'Refusing non-test host',
    );
    // Compile this pure helper in memory; do not bootstrap Nest, migrations,
    // local .env files, application jobs or production integrations.
    const helperFile = path.resolve(
      __dirname,
      '../../src/modules/finance/finance-transaction-scope.ts',
    );
    const compiled = ts.transpileModule(fs.readFileSync(helperFile, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2023,
      },
    });
    const helper = new Module(helperFile, module);
    helper._compile(compiled.outputText, helperFile);
    const { financeTransactionScope } = helper.exports;
    const { Client } = require('pg');
    const client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_DATABASE,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE users (user_id TEXT PRIMARY KEY, tenant_id TEXT) ON COMMIT DROP;
        CREATE TEMP TABLE finance_fee_demands (demand_id TEXT PRIMARY KEY, tenant_id TEXT, student_user_id TEXT) ON COMMIT DROP;
        CREATE TEMP TABLE finance_transactions (transaction_id TEXT PRIMARY KEY, tenant_id TEXT, demand_id TEXT, student_user_id TEXT, receipt_url TEXT, deleted_at TIMESTAMPTZ) ON COMMIT DROP;
        INSERT INTO users VALUES ('student-a','tenant-a'), ('student-b','tenant-b');
        INSERT INTO finance_fee_demands VALUES ('demand-a','tenant-a','student-a'), ('demand-b','tenant-b','student-b');
        INSERT INTO finance_transactions VALUES
          ('explicit-a','tenant-a','demand-a','student-a',NULL,NULL),
          ('explicit-a-unlinked','tenant-a',NULL,NULL,NULL,NULL),
          ('legacy-a',NULL,'demand-a','student-a',NULL,NULL),
          ('legacy-a-student',NULL,NULL,'student-a',NULL,NULL),
          ('legacy-a-demand',NULL,'demand-a',NULL,NULL,NULL),
          ('foreign-b','tenant-b','demand-b','student-b',NULL,NULL),
          ('legacy-b',NULL,'demand-b','student-b',NULL,NULL),
          ('unowned',NULL,NULL,NULL,NULL,NULL),
          ('missing-demand',NULL,'missing','student-a',NULL,NULL),
          ('mismatch-student',NULL,'demand-a','student-b',NULL,NULL),
          ('conflicting-tenant','tenant-a','demand-b','student-b',NULL,NULL),
          ('conflicting-user','tenant-a','demand-a','student-b',NULL,NULL),
          ('archived-a','tenant-a','demand-a','student-a',NULL,NOW());
      `);
      const query = `SELECT t.transaction_id FROM finance_transactions t
        LEFT JOIN finance_fee_demands d ON d.demand_id=t.demand_id
        LEFT JOIN users u ON u.user_id=t.student_user_id
        WHERE t.transaction_id=$1 AND ${financeTransactionScope('$2')}
          AND t.deleted_at IS NULL FOR UPDATE OF t`;
      const rows = await client.query(
        'SELECT transaction_id FROM finance_transactions ORDER BY transaction_id',
      );
      for (const tenant of ['tenant-a', 'tenant-b']) {
        const allowed = [];
        for (const row of rows.rows)
          if (
            (await client.query(query, [row.transaction_id, tenant])).rowCount
          )
            allowed.push(row.transaction_id);
        assert.deepEqual(
          allowed.sort(),
          tenant === 'tenant-a'
            ? [
                'explicit-a',
                'explicit-a-unlinked',
                'legacy-a',
                'legacy-a-demand',
                'legacy-a-student',
              ].sort()
            : ['foreign-b', 'legacy-b'],
        );
      }
      // Authorization must not silently backfill or reassign any existing data.
      assert.equal(
        (
          await client.query(
            'SELECT COUNT(*)::int AS count FROM finance_transactions WHERE tenant_id IS NULL',
          )
        ).rows[0].count,
        7,
      );
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  },
);
