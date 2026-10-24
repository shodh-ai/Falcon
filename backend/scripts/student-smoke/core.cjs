'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client, types } = require('pg');
// PostgreSQL DATE is a civil date, not a midnight instant in the host timezone.
types.setTypeParser(1082, (value) => value);

const ROOT = path.resolve(__dirname, '../..');
const PREFIX = 'student.complete-smoke.v1';
const LABEL = '[SMOKE v1]';
const SUBDOMAIN = 'falcon-student-smoke';
const LOCAL = path.join(__dirname, 'local');

function loadEnv() {
  const env = {};
  const file = path.join(ROOT, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
      if (!match) continue;
      env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { ...env, ...process.env };
}

function safetyConfig(env = loadEnv()) {
  const nodeEnv = String(env.NODE_ENV || '').toLowerCase();
  if (!['development', 'test'].includes(nodeEnv)) throw new Error('Development/test NODE_ENV is required.');
  if (['production', 'prod'].includes(String(env.DATABASE_ENV || env.DEPLOYMENT_ENV || '').toLowerCase())) throw new Error('Production database configuration is forbidden.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(env.DB_HOST)) throw new Error('Only a loopback database host is allowed.');
  if (Number(env.DB_PORT) !== 5433 || env.DB_DATABASE !== 'university_governance') throw new Error('This fixture is authorized only for localhost:5433/university_governance.');
  if (env.FALCON_SMOKE_ENABLE !== '1') throw new Error('Explicit FALCON_SMOKE_ENABLE=1 confirmation is required.');
  const apiMode = env.FALCON_SMOKE_NORMAL_DOCKER === '1' ? 'local-docker' : 'isolated';
  const apiPort = apiMode === 'local-docker' ? '4000' : '4100';
  const api = new URL(env.FALCON_SMOKE_API_URL || `http://127.0.0.1:${apiPort}`);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname) || api.protocol !== 'http:' || api.port !== apiPort || api.username || api.password) throw new Error(`Only the explicitly selected local API on port ${apiPort} is allowed.`);
  return {
    env,
    api: api.origin,
    apiMode,
    db: { host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USERNAME || env.DB_USER || 'postgres', password: env.DB_PASSWORD || '', database: env.DB_DATABASE },
  };
}

function assertLocalDockerApi(containers, config) {
  const api = containers.find((c) => c.Name === '/backend-falcon-api-1');
  const postgres = containers.find((c) => c.Name === '/falcon-postgres-1');
  const environment = (c) => Object.fromEntries((c?.Config?.Env || []).map((item) => {
    const index = item.indexOf('='); return [item.slice(0, index), item.slice(index + 1)];
  }));
  const env = environment(api);
  const pgEnv = environment(postgres);
  const bindings = api?.HostConfig?.PortBindings?.['4000/tcp'] || [];
  const pgBindings = postgres?.HostConfig?.PortBindings?.['5432/tcp'] || [];
  if (!api?.State?.Running || api.State.Health?.Status !== 'healthy' || !postgres?.State?.Running ||
      env.FALCON_LOCAL_DOCKER !== '1' || env.NODE_ENV !== 'production' || env.DB_SYNCHRONIZE !== 'false' ||
      env.DB_HOST !== 'postgres' || env.DB_PORT !== '5432' || env.DB_DATABASE !== config.db.database ||
      pgEnv.POSTGRES_DB !== config.db.database || api.Config.Cmd?.join(' ') !== 'node dist/main.js' ||
      api.Config.Labels?.['com.docker.compose.project'] !== 'backend' ||
      api.Config.Labels?.['com.docker.compose.service'] !== 'falcon-api' ||
      postgres.Config.Labels?.['com.docker.compose.project'] !== 'falcon' ||
      !api.NetworkSettings?.Networks?.falcon_default || !postgres.NetworkSettings?.Networks?.falcon_default ||
      bindings.length !== 1 || bindings[0].HostIp !== '127.0.0.1' || bindings[0].HostPort !== '4000' ||
      !pgBindings.some((binding) => binding.HostPort === String(config.db.port))) {
    throw new Error('Refusing unverified local Docker API/database identity.');
  }
  return { containerId: api.Id, imageId: api.Image, command: api.Config.Cmd, health: api.State.Health.Status };
}

function identifier(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error('Invalid schema identifier.');
  return `"${value}"`;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /password|token|secret|authorization|hash/i.test(key) ? '<redacted>' : redact(item),
  ]));
}

function writeReport(report, directory = LOCAL) {
  const historyDirectory = path.join(directory, 'reports');
  fs.mkdirSync(historyDirectory, { recursive: true });
  report.finishedAt = new Date().toISOString();
  const historyFile = path.join(historyDirectory,
    `${report.finishedAt.replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.json`);
  report.evidenceFile = historyFile;
  const serialized = JSON.stringify(redact(report), null, 2);
  // Keep each executed run as evidence, even when a later browser run fails.
  fs.writeFileSync(historyFile, serialized, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'report.json'), serialized);
  return historyFile;
}

async function createContext(config) {
  let dockerIdentity;
  if (config.apiMode === 'local-docker') {
    const inspection = spawnSync('docker', ['inspect', 'backend-falcon-api-1', 'falcon-postgres-1'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (inspection.status !== 0) throw new Error('Cannot verify local Docker API identity; no test writes permitted.');
    dockerIdentity = assertLocalDockerApi(JSON.parse(inspection.stdout), config);
    const health = await fetch(`${config.api}/health`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!health.ok || (await health.json()).status !== 'ok' || health.headers.has('x-falcon-smoke-environment')) throw new Error('Normal Docker API health/identity check failed.');
  } else {
    const probe = await fetch(`${config.api}/api/auth/local-login`, { signal: AbortSignal.timeout(5000) });
    if (probe.headers.get('x-falcon-smoke-environment') !== 'test' || probe.headers.get('x-falcon-smoke-database') !== config.db.database) throw new Error('Isolated API identity was not verified before writes.');
  }
  const db = new Client(config.db);
  await db.connect();
  const identity = (await db.query('SELECT current_database() AS database, inet_server_port() AS port, pg_is_in_recovery() AS recovery')).rows[0];
  if (identity.database !== 'university_governance' || identity.recovery) { await db.end(); throw new Error('Unexpected database identity.'); }
  await db.query('SELECT pg_advisory_lock(hashtext($1))', [PREFIX]);
  const tables = new Map();
  let insertQueue = Promise.resolve();
  const report = { version: 1, seed: PREFIX, environment: { node: config.env.NODE_ENV, host: config.db.host, port: config.db.port, database: identity.database, api: config.api, apiMode: config.apiMode, dockerIdentity }, startedAt: new Date().toISOString(), records: {}, tests: [], limitations: [] };
  const ctx = { db, config, report, ids: {}, actors: {}, allowedTenantIds: new Set(), seedDate: null, academicYear: '2026-2027', label: LABEL, prefix: PREFIX, subdomain: SUBDOMAIN };

  async function schema(table) {
    if (!tables.has(table)) {
      identifier(table);
      const columns = (await db.query(`SELECT column_name,udt_name,is_nullable,column_default,character_maximum_length,is_identity,is_generated FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).rows;
      if (!columns.length) throw new Error(`Required existing table missing: ${table}`);
      const primary = (await db.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=to_regclass($1) AND i.indisprimary ORDER BY a.attnum`, [`public.${table}`])).rows.map((row) => row.attname);
      tables.set(table, { columns, primary });
    }
    return tables.get(table);
  }
  ctx.schema = schema;
  ctx.check = (name, condition, details = null) => {
    report.tests.push({ name, status: condition ? 'PASS' : 'FAIL', details: redact(details) });
    if (name.startsWith('Browser ')) console.log(`${name}: ${condition ? 'PASS' : 'FAIL'}`);
    return Boolean(condition);
  };
  ctx.blocked = (name, reason) => {
    report.tests.push({ name, status: 'BLOCKED', details: reason });
    if (!report.limitations.some((item) => item.name === name)) report.limitations.push({ name, reason });
  };

  ctx.track = async (table, row, feature, created = false) => {
    const { primary, columns } = await schema(table);
    (report.mandatorySchemaFields ||= {})[table] = columns.filter((column) => column.is_nullable === 'NO').map((column) => column.column_name);
    const recordId = primary.map((key) => String(row[key])).join(':');
    if (!recordId || recordId.includes('undefined')) throw new Error(`Cannot track ${table} without actual primary key.`);
    if (row.tenant_id && ctx.ids.tenantId && !ctx.allowedTenantIds.has(row.tenant_id) && row.tenant_id !== ctx.ids.tenantId && table !== 'tenants') throw new Error(`Refusing foreign tenant record: ${table}`);
    const key = manifestKey(table, recordId);
    await db.query(`INSERT INTO smoke_seed_manifest (smoke_key,portal,role_email,feature_area,sample_record,notes)
      VALUES ($1,'Student',$2,$3,$4,$5) ON CONFLICT (smoke_key) DO NOTHING`,
    [key, ctx.actors.student?.email || 'student@falcon-smoke.invalid', feature, recordId, JSON.stringify({ seed: PREFIX, table, primary: Object.fromEntries(primary.map((name) => [name, row[name]])), tenantId: row.tenant_id || ctx.ids.tenantId, synthetic: true })]);
    const counts = report.records[table] ||= { created: 0, reused: 0, ids: [] };
    if (!counts.ids.includes(recordId)) {
      counts[created ? 'created' : 'reused'] += 1;
      counts.ids.push(recordId);
    }
    return row;
  };

  ctx.ensureRow = async (table, values, match, feature = table) => {
    const { columns, primary } = await schema(table);
    const names = new Set(columns.map((column) => column.column_name));
    for (const key of [...Object.keys(values), ...Object.keys(match)]) if (!names.has(key)) throw new Error(`Unsupported existing column ${table}.${key}`);
    if ('tenant_id' in values && ctx.ids.tenantId && values.tenant_id !== ctx.ids.tenantId && !ctx.allowedTenantIds.has(values.tenant_id) && table !== 'tenants') throw new Error(`Wrong tenant for ${table}`);
    if (!Object.keys(match).length) throw new Error('A precise idempotency key is required.');
    const where = Object.keys(match).map((name, index) => `${identifier(name)} IS NOT DISTINCT FROM $${index + 1}`).join(' AND ');
    const found = (await db.query(`SELECT * FROM ${identifier(table)} WHERE ${where}`, Object.values(match))).rows;
    if (found.length > 1) throw new Error(`Ambiguous seed idempotency key: ${table}`);
    if (found[0]) {
      const row = found[0];
      const ownKey = manifestKey(table, primary.map((key) => String(row[key])).join(':'));
      const owned = (await db.query('SELECT 1 FROM smoke_seed_manifest WHERE smoke_key=$1', [ownKey])).rowCount;
      if (!owned) throw new Error(`Existing unowned record collides with smoke fixture: ${table}`);
      if (row.deleted_at) throw new Error(`Archived smoke record requires explicit recovery, not overwrite: ${table}`);
      return ctx.track(table, row, feature, false);
    }
    for (const column of columns) {
      const value = values[column.column_name];
      if (column.is_nullable === 'NO' && !column.column_default && column.is_identity !== 'YES' && column.is_generated === 'NEVER' && value == null) throw new Error(`Mandatory field missing: ${table}.${column.column_name}`);
      if (typeof value === 'string' && column.character_maximum_length && value.length > column.character_maximum_length) throw new Error(`Field too long: ${table}.${column.column_name}`);
    }
    const keys = Object.keys(values);
    const parameters = keys.map((key) => {
      const column = columns.find((item) => item.column_name === key);
      return ['json', 'jsonb'].includes(column.udt_name) && values[key] != null && typeof values[key] !== 'string' ? JSON.stringify(values[key]) : values[key];
    });
    const insert = insertQueue.then(async () => {
      await db.query('BEGIN');
      try {
        const row = (await db.query(`INSERT INTO ${identifier(table)} (${keys.map(identifier).join(',')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`, parameters)).rows[0];
        await ctx.track(table, row, feature, true);
        await db.query('COMMIT');
        return row;
      } catch (error) { await db.query('ROLLBACK'); throw error; }
    });
    insertQueue = insert.catch(() => {});
    return insert;
  };

  ctx.request = async (actor, method, route, body, options = {}) => {
    const response = await fetch(`${config.api}${route}`, {
      method,
      headers: { 'x-tenant-subdomain': actor?.subdomain || ctx.subdomain, ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(45000),
    });
    if (config.apiMode !== 'local-docker' && response.headers.get('x-falcon-smoke-environment') !== 'test') throw new Error('Refusing API without isolated test-environment identity.');
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!response.ok) {
      const error = new Error(`${method} ${route.split('?')[0]} HTTP ${response.status}: ${JSON.stringify(redact(data)).slice(0, 1000)}`);
      error.status = response.status;
      error.data = redact(data);
      throw error;
    }
    return data;
  };
  ctx.upload = async (actor, route, fields, file) => {
    if (config.apiMode === 'local-docker') throw new Error('Uploads are not enabled for the normal-backend examination check.');
    const uploadKey = `${PREFIX}:upload:${crypto.createHash('sha256').update(`${actor.id}:${route}:${file.name}:${fields?.smoke_test_reference || ''}`).digest('hex').slice(0, 32)}`;
    if (route === '/api/uploads/single') {
      const saved = (await db.query('SELECT notes FROM smoke_seed_manifest WHERE smoke_key=$1', [uploadKey])).rows[0];
      if (saved) return JSON.parse(saved.notes).response;
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(fields || {})) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    form.append(file.field || 'file', new Blob([file.buffer], { type: file.type }), file.name);
    const response = await fetch(`${config.api}${route}`, { method: 'POST', headers: { 'x-tenant-subdomain': ctx.subdomain, Authorization: `Bearer ${actor.token}` }, body: form, signal: AbortSignal.timeout(45000) });
    if (response.headers.get('x-falcon-smoke-environment') !== 'test') throw new Error('Unexpected upload API environment.');
    const data = await response.json();
    if (!response.ok) { const error = new Error(`POST ${route} HTTP ${response.status}: ${JSON.stringify(redact(data)).slice(0, 1000)}`); error.status = response.status; throw error; }
    if (route === '/api/uploads/single') await db.query(`INSERT INTO smoke_seed_manifest(smoke_key,portal,role_email,feature_area,sample_record,notes) VALUES($1,'Student',$2,'Synthetic file uploads',$3,$4) ON CONFLICT(smoke_key) DO NOTHING`, [uploadKey, actor.email, file.name, JSON.stringify({ seed: PREFIX, synthetic: true, tenantId: ctx.ids.tenantId, response: data })]);
    return data;
  };
  ctx.fixture = async (kind, metadata) => {
    const allowed = ['identity', 'secondary', 'senior-secondary', 'material', 'assignment', 'certificate', 'receipt', 'policy'];
    if (kind === 'photo') return { name: 'fictional-smoke-avatar.jpg', type: 'image/jpeg', buffer: fs.readFileSync(path.join(ROOT, 'assets/demo-student-avatar.jpg')) };
    if (kind === 'receipt' && metadata) {
      const python = config.env.FALCON_SMOKE_PYTHON || 'python';
      const generated = spawnSync(python, [path.join(__dirname, 'fixtures.py'), '--receipt-json', JSON.stringify(metadata)], { windowsHide: true, encoding: 'utf8' });
      if (generated.status !== 0) throw new Error('Synthetic receipt PDF generation failed.');
      const name = `falcon-smoke-receipt-${metadata.transactionId}.pdf`;
      return { name, type: 'application/pdf', buffer: fs.readFileSync(path.join(__dirname, 'output/pdf', name)) };
    }
    const selected = allowed.includes(kind) ? kind : 'certificate';
    return { name: `falcon-smoke-${selected}.pdf`, type: 'application/pdf', buffer: fs.readFileSync(path.join(__dirname, 'output/pdf', `falcon-smoke-${selected}.pdf`)) };
  };
  ctx.close = async () => { await db.query('SELECT pg_advisory_unlock(hashtext($1))', [PREFIX]); await db.end(); };
  ctx.saveReport = () => writeReport(report);
  return ctx;
}

function manifestKey(table, recordId) {
  const key = `${PREFIX}:${table}:${recordId}`;
  return key.length <= 120 ? key : `${PREFIX}:${table}:${crypto.createHash('sha256').update(recordId).digest('hex').slice(0, 24)}`;
}

module.exports = { ROOT, PREFIX, LABEL, SUBDOMAIN, LOCAL, loadEnv, safetyConfig, assertLocalDockerApi, identifier, redact, createContext, manifestKey, writeReport };
