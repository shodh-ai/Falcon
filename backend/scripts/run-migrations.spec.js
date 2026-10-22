const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const runnerSource = fs.readFileSync(
  path.join(__dirname, 'run-migrations.js'),
  'utf8',
);

/** Execute the real runner against in-memory files and a fake database only. */
function isolatedRunner(options = {}) {
  const sqlFiles = options.sqlFiles || {
    '001_schema.sql': "SELECT 'reviewed schema';",
    '002_legacy_accounts.sql': "SELECT 'legacy account reset';",
    '20260529152000_seed_master_test_personas.sql':
      "SELECT 'known-password fixture';",
    'local.seed.sql': "SELECT 'explicit seed';",
  };
  const hashes = Object.fromEntries(
    Object.entries(sqlFiles).map(([name, sql]) => [
      name,
      createHash('sha256').update(sql).digest('hex'),
    ]),
  );
  const queries = [];
  const applied = new Set(options.applied || []);
  const connections = [];
  const module = { exports: {} };
  const environment = {
    NODE_ENV: 'production',
    DATABASE_ENV: 'production',
    DB_HOST: 'identified-test.invalid',
    DB_DATABASE: 'fake_database_never_connected',
    ...(options.env || {}),
  };
  if (options.manifest !== undefined) {
    environment.PRODUCTION_MIGRATION_MANIFEST = '/reviewed-migrations.json';
  }
  const manifest =
    typeof options.manifest === 'function'
      ? options.manifest(hashes)
      : options.manifest;
  const fakeFs = {
    existsSync: () => false,
    readdirSync: () => Object.keys(sqlFiles),
    readFileSync(file, encoding) {
      if (file === '/reviewed-migrations.json') {
        return options.rawManifest || JSON.stringify(manifest);
      }
      const name = path.basename(file);
      assert.ok(Object.hasOwn(sqlFiles, name), `Unexpected file read: ${name}`);
      const bytes = Buffer.from(sqlFiles[name]);
      return encoding ? bytes.toString(encoding) : bytes;
    },
  };
  class FakeClient {
    constructor(configuration) {
      connections.push(configuration);
    }
    async connect() {}
    async end() {}
    async query(sql, parameters = []) {
      queries.push({ sql, parameters });
      if (sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
        options.beforeLedgerWrite?.(sqlFiles);
      }
      if (sql.includes('to_regclass')) {
        return {
          rows: [
            { migration_table: options.noLedger ? null : 'schema_migrations' },
          ],
        };
      }
      if (sql === 'SELECT filename FROM schema_migrations') {
        return { rows: [...applied].map((filename) => ({ filename })) };
      }
      if (sql.includes('SELECT COUNT(*)::int AS n')) {
        return { rows: [{ n: applied.size }] };
      }
      if (sql.startsWith('SELECT 1 FROM schema_migrations')) {
        return { rows: applied.has(parameters[0]) ? [{}] : [] };
      }
      if (sql.startsWith('INSERT INTO schema_migrations'))
        applied.add(parameters[0]);
      return { rows: [] };
    }
  }
  const fakeRequire = (name) => {
    if (name === 'fs') return fakeFs;
    if (name === 'path') return path;
    if (name === 'crypto') return require('node:crypto');
    if (name === 'pg') return { Client: FakeClient };
    if (name === './sync-schema')
      return {
        coreTablesExist: async () => options.coreTables !== false,
        run: async () => queries.push({ sql: 'LOCAL_SCHEMA_BOOTSTRAP' }),
      };
    throw new Error(`Unexpected require: ${name}`);
  };
  vm.runInNewContext(runnerSource, {
    require: fakeRequire,
    module,
    __dirname,
    process: {
      env: environment,
      argv: ['node', 'run-migrations.js', ...(options.args || [])],
      exit: () => {
        throw new Error('Unexpected process exit');
      },
    },
    console: { log() {}, error() {} },
  });
  return {
    run: module.exports.run,
    queries,
    connections,
    sqlFiles,
    applied,
    executedFiles: () =>
      queries.filter(({ sql }) => Object.values(sqlFiles).includes(sql)),
  };
}

test('migration runner requires explicit non-production schema bootstrap opt-in', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'run-migrations.js'),
    'utf8',
  );
  assert.match(source, /ALLOW_SCHEMA_BOOTSTRAP_SYNC/);
  assert.match(source, /Refusing automatic schema bootstrap in production/);
  assert.match(source, /ALLOW_STANDARD_SEED/);
  assert.match(source, /outside an explicitly local development environment/);
});

test('production refuses every pending migration before schema/ledger writes without a manifest', async () => {
  const runner = isolatedRunner({ noLedger: true });
  await assert.rejects(
    runner.run(),
    /Refusing unreviewed production migrations/,
  );
  assert.equal(runner.executedFiles().length, 0);
  assert.ok(
    !runner.queries.some(({ sql }) => /CREATE|INSERT|TRUNCATE|BEGIN/.test(sql)),
  );
});

test('production preflights the entire plan before executing an earlier reviewed file', async () => {
  const runner = isolatedRunner({
    manifest: (hashes) => ({
      version: 1,
      migrations: { '001_schema.sql': hashes['001_schema.sql'] },
    }),
  });
  await assert.rejects(
    runner.run(),
    /unreviewed or changed.*002_legacy_accounts.sql/,
  );
  assert.equal(runner.executedFiles().length, 0);
});

test('production refuses a changed SQL file after its review hash was recorded', async () => {
  const runner = isolatedRunner({
    applied: [
      '002_legacy_accounts.sql',
      '20260529152000_seed_master_test_personas.sql',
    ],
    manifest: { version: 1, migrations: { '001_schema.sql': 'a'.repeat(64) } },
  });
  await assert.rejects(runner.run(), /unreviewed or changed.*001_schema.sql/);
  assert.equal(runner.executedFiles().length, 0);
});

test('production executes only byte-matched reviewed pending SQL, retaining applied historical entries', async () => {
  const runner = isolatedRunner({
    applied: [
      '002_legacy_accounts.sql',
      '20260529152000_seed_master_test_personas.sql',
    ],
    manifest: (hashes) => ({
      version: 1,
      migrations: { '001_schema.sql': hashes['001_schema.sql'] },
    }),
  });
  await runner.run();
  assert.deepEqual(
    runner.executedFiles().map(({ sql }) => sql),
    [runner.sqlFiles['001_schema.sql']],
  );
  assert.ok(runner.applied.has('001_schema.sql'));
});

test('production requires no manifest when every migration is already recorded', async () => {
  const runner = isolatedRunner({
    applied: [
      '001_schema.sql',
      '002_legacy_accounts.sql',
      '20260529152000_seed_master_test_personas.sql',
    ],
  });
  await runner.run();
  assert.equal(runner.executedFiles().length, 0);
});

test('production executes the reviewed bytes even if a file changes after preflight', async () => {
  const original = "SELECT 'reviewed schema';";
  const replacement = "SELECT 'unreviewed replacement';";
  const runner = isolatedRunner({
    applied: [
      '002_legacy_accounts.sql',
      '20260529152000_seed_master_test_personas.sql',
    ],
    manifest: (hashes) => ({
      version: 1,
      migrations: { '001_schema.sql': hashes['001_schema.sql'] },
    }),
    beforeLedgerWrite: (files) => {
      files['001_schema.sql'] = replacement;
    },
  });
  await runner.run();
  assert.ok(runner.queries.some(({ sql }) => sql === original));
  assert.ok(!runner.queries.some(({ sql }) => sql === replacement));
});

test('production rejects malformed or unknown manifest entries', async (t) => {
  for (const manifest of [
    { version: 2, migrations: {} },
    { version: 1, migrations: [] },
    { version: 1, migrations: { '../001_schema.sql': 'a'.repeat(64) } },
    { version: 1, migrations: { '001_schema.sql': 'not-a-hash' } },
  ]) {
    await t.test(JSON.stringify(manifest), async () => {
      const runner = isolatedRunner({ manifest });
      await assert.rejects(
        runner.run(),
        /Invalid production migration manifest/,
      );
      assert.equal(runner.executedFiles().length, 0);
    });
  }
});

test('production refuses ledger repair/replay and every known-password seed command before connecting', async (t) => {
  for (const args of [
    ['--force'],
    ['--repair'],
    ['--seed'],
    ['--dofa-qa-seed'],
  ]) {
    await t.test(args[0], async () => {
      const runner = isolatedRunner({
        args,
        env: {
          ALLOW_STANDARD_SEED: 'true',
          DOFA_QA_SEED_ENABLED: 'true',
        },
      });
      await assert.rejects(runner.run(), /Refusing/);
      assert.equal(runner.connections.length, 0);
    });
  }
});

test('production markers cannot be masked by a different local environment marker', async (t) => {
  for (const env of [
    { NODE_ENV: 'production', DATABASE_ENV: 'local' },
    {
      NODE_ENV: 'development',
      DATABASE_ENV: 'local',
      DEPLOYMENT_ENV: 'production',
    },
    { NODE_ENV: 'test', DATABASE_ENV: ' PROD ' },
  ]) {
    await t.test(JSON.stringify(env), async () => {
      const runner = isolatedRunner({ env });
      await assert.rejects(
        runner.run(),
        /Refusing unreviewed production migrations/,
      );
      assert.equal(runner.executedFiles().length, 0);
    });
  }
});

test('production refuses schema synchronization even with the local opt-in', async () => {
  const runner = isolatedRunner({
    coreTables: false,
    env: { ALLOW_SCHEMA_BOOTSTRAP_SYNC: 'true' },
  });
  await assert.rejects(
    runner.run(),
    /Refusing automatic schema bootstrap in production/,
  );
  assert.ok(
    !runner.queries.some(({ sql }) => sql === 'LOCAL_SCHEMA_BOOTSTRAP'),
  );
});

test('local development migration behavior remains unchanged without a review manifest', async () => {
  const runner = isolatedRunner({
    env: { NODE_ENV: 'development', DATABASE_ENV: 'local' },
  });
  await runner.run();
  assert.equal(runner.executedFiles().length, 3);
  assert.ok(!runner.applied.has('local.seed.sql'));
});

test('production Docker frontend build uses the verified Webpack build path', () => {
  const dockerfile = fs.readFileSync(
    path.join(__dirname, '../../frontend/Dockerfile'),
    'utf8',
  );
  assert.match(dockerfile, /npm run build -- --webpack/);
});
