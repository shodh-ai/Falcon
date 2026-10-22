const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, 'sync-schema.js'), 'utf8');

/** Exercise the real entry point without a network, database, build or disk write. */
function isolatedBootstrap(options = {}) {
  const events = [];
  const module = { exports: {} };
  const processStub = {
    env: {
      NODE_ENV: 'development',
      DATABASE_ENV: 'local',
      ALLOW_SCHEMA_BOOTSTRAP_SYNC: 'true',
      ...(options.env || {}),
    },
  };
  class FakeClient {
    constructor(configuration) {
      events.push({ type: 'client', configuration });
    }
    async connect() {
      events.push({ type: 'connect' });
    }
    async end() {
      events.push({ type: 'end' });
    }
    async query(sql) {
      events.push({ type: 'query', sql });
      return { rows: [{ n: options.coreTables ? 3 : 0 }] };
    }
  }
  class FakeDataSource {
    constructor(configuration) {
      events.push({ type: 'dataSource', configuration });
    }
    async initialize() {
      events.push({ type: 'initialize' });
    }
    async destroy() {
      events.push({ type: 'destroy' });
    }
  }
  const fakeRequire = (name) => {
    if (name === 'fs')
      return {
        existsSync(file) {
          return path.basename(file) === '.env'
            ? !!options.envFile
            : options.compiled !== false;
        },
        readFileSync: () => options.envFile,
      };
    if (name === 'path') return path;
    if (name === 'child_process')
      return {
        execSync: (command) => events.push({ type: 'build', command }),
      };
    if (name === 'pg') return { Client: FakeClient };
    if (name === 'typeorm') return { DataSource: FakeDataSource };
    if (name === 'reflect-metadata') return {};
    if (name === '../dist/entities')
      return { SyntheticEntity: function SyntheticEntity() {} };
    throw new Error(`Unexpected module: ${name}`);
  };
  vm.runInNewContext(source, {
    module,
    require: fakeRequire,
    __dirname,
    process: processStub,
    console: { log() {} },
  });
  return {
    run: module.exports.run,
    coreTablesExist: module.exports.coreTablesExist,
    events,
  };
}

test('direct schema bootstrap requires exact explicit opt-in before any database or build action', async (t) => {
  for (const value of [undefined, '', 'false', 'TRUE']) {
    await t.test(String(value), async () => {
      const runner = isolatedBootstrap({
        env: { ALLOW_SCHEMA_BOOTSTRAP_SYNC: value },
      });
      await assert.rejects(
        runner.run(),
        /set ALLOW_SCHEMA_BOOTSTRAP_SYNC=true explicitly/,
      );
      assert.equal(runner.events.length, 0);
    });
  }
});

test('direct bootstrap rejects every production marker even with local opt-in and conflicting local markers', async (t) => {
  for (const env of [
    { NODE_ENV: 'production', DATABASE_ENV: 'local' },
    { NODE_ENV: 'development', DATABASE_ENV: 'production' },
    {
      NODE_ENV: 'development',
      DATABASE_ENV: 'local',
      DEPLOYMENT_ENV: 'production',
    },
    { NODE_ENV: ' PROD ', DATABASE_ENV: 'local' },
    { NODE_ENV: 'development', DATABASE_ENV: 'prod' },
  ]) {
    await t.test(JSON.stringify(env), async () => {
      const runner = isolatedBootstrap({
        env,
        compiled: false,
        coreTables: true,
      });
      await assert.rejects(
        runner.run(),
        /Refusing automatic schema bootstrap in production/,
      );
      assert.equal(runner.events.length, 0);
    });
  }
});

test('production marker loaded from a deployment environment file is checked before any connection', async () => {
  const runner = isolatedBootstrap({ envFile: 'DEPLOYMENT_ENV=production\n' });
  await assert.rejects(
    runner.run(),
    /Refusing automatic schema bootstrap in production/,
  );
  assert.equal(runner.events.length, 0);
});

test('explicit local bootstrap initializes and closes the synthetic schema data source', async () => {
  const runner = isolatedBootstrap();
  const result = await runner.run({ quiet: true });
  assert.equal(result.bootstrapped, true);
  assert.equal(
    runner.events.filter((event) => event.type === 'initialize').length,
    1,
  );
  assert.equal(
    runner.events.filter((event) => event.type === 'destroy').length,
    1,
  );
  assert.equal(
    runner.events.find((event) => event.type === 'dataSource').configuration
      .synchronize,
    true,
  );
  assert.ok(!runner.events.some((event) => event.type === 'build'));
});

test('explicit local bootstrap preserves an existing schema without synchronizing it', async () => {
  const runner = isolatedBootstrap({ coreTables: true });
  const result = await runner.run();
  assert.equal(result.bootstrapped, false);
  assert.ok(
    !runner.events.some((event) =>
      ['build', 'dataSource', 'initialize'].includes(event.type),
    ),
  );
});

test('explicit local bootstrap may build missing entity artifacts only after safety checks', async () => {
  const runner = isolatedBootstrap({ compiled: false });
  await runner.run();
  assert.deepEqual(
    runner.events.filter((event) => event.type === 'build'),
    [{ type: 'build', command: 'npm run build' }],
  );
  assert.equal(
    runner.events.filter((event) => event.type === 'initialize').length,
    1,
  );
});

test('read-only catalog probe remains available for guarded production migration preflight', async () => {
  const runner = isolatedBootstrap({
    env: { NODE_ENV: 'production' },
    coreTables: true,
  });
  assert.equal(await runner.coreTablesExist(), true);
  assert.ok(
    !runner.events.some((event) =>
      ['build', 'dataSource', 'initialize'].includes(event.type),
    ),
  );
});
