const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  migrationEnvironment,
  runDeploymentMigration,
} = require('./deploy-migrate');

const credentials = {
  NODE_ENV: 'production',
  DB_USERNAME: 'falcon_api',
  DB_PASSWORD: 'runtime-placeholder',
  MIGRATION_DB_HOST: 'database.invalid',
  MIGRATION_DB_DATABASE: 'falcon_restore_test',
  MIGRATION_DB_USERNAME: 'falcon_migrator',
  MIGRATION_DB_PASSWORD: 'migration-placeholder',
};

test('requires an explicit target and separate migration identity without falling back to API credentials', () => {
  for (const key of ['HOST', 'DATABASE', 'USERNAME', 'PASSWORD']) {
    const env = { ...credentials };
    delete env[`MIGRATION_DB_${key}`];
    assert.throws(
      () => migrationEnvironment(env),
      new RegExp(`MIGRATION_DB_${key}`),
    );
  }
  assert.throws(
    () =>
      migrationEnvironment({
        ...credentials,
        MIGRATION_DB_USERNAME: 'falcon_api',
      }),
    /identities must be different/,
  );
  assert.throws(
    () =>
      migrationEnvironment({ ...credentials, MIGRATION_DB_PORT: 'invalid' }),
    /MIGRATION_DB_PORT/,
  );
});

test('runs only the migration runner, using migration credentials without mutating the caller', () => {
  const env = { ...credentials };
  let calls = 0;
  runDeploymentMigration({
    env,
    argv: [],
    spawn(executable, args, options) {
      calls += 1;
      assert.equal(executable, process.execPath);
      assert.equal(args.length, 1);
      assert.ok(args[0].endsWith('/scripts/run-migrations.js'));
      assert.equal(options.env.DB_USERNAME, 'falcon_migrator');
      assert.equal(options.env.DB_PASSWORD, 'migration-placeholder');
      assert.equal(options.env.DB_HOST, 'database.invalid');
      assert.equal(options.env.DB_DATABASE, 'falcon_restore_test');
      assert.equal(options.env.DB_SYNCHRONIZE, 'false');
      assert.equal(options.env.MIGRATION_DB_PASSWORD, undefined);
      return { status: 0 };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(env, credentials);
});

test('rejects destructive runner flags before executing a subprocess', () => {
  for (const flag of ['--repair', '--seed', '--dofa-qa-seed']) {
    assert.throws(
      () =>
        runDeploymentMigration({
          env: credentials,
          argv: [flag],
          spawn() {
            assert.fail('must not execute a subprocess');
          },
        }),
      /accepts no repair, seed/,
    );
  }
});

test('propagates migration failure or interruption without starting the API', () => {
  for (const result of [
    { status: 1 },
    { status: null, signal: 'SIGTERM' },
    { error: new Error('spawn failure') },
  ]) {
    assert.throws(() =>
      runDeploymentMigration({
        env: credentials,
        argv: [],
        spawn() {
          return result;
        },
      }),
    );
  }
});
