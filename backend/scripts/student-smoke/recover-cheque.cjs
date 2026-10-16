'use strict';

// Explicitly approved exact synthetic recovery through the corrected service.
// No gateway calls, new HTTP endpoint, or raw invoice-balance writes here.
const path = require('node:path');
const { DataSource } = require('typeorm');
const { ROOT, PREFIX, SUBDOMAIN } = require('./core.cjs');

async function recoverApprovedCheque(ctx) {
  const transactionId = 'bc8baf67-d4a3-4de3-9e03-354268ea758d';
  if (ctx.config.env.NODE_ENV !== 'test' || ctx.config.env.FALCON_SMOKE_ENABLE !== '1' || ctx.ids.tenantId !== '65970c92-3b45-4eca-9421-10c6d1a323a5' || ctx.actors.admin?.role !== 'SuperAdmin') throw new Error('Approved synthetic recovery context is required.');
  const actor = (await ctx.db.query(`SELECT u.user_id FROM users u JOIN roles r ON r.role_id=u.role_id JOIN tenants t ON t.tenant_id=u.tenant_id WHERE u.tenant_id=$1 AND u.user_id=$2 AND r.role_name='SuperAdmin' AND u.is_active=true AND u.official_email='admin@falcon-smoke.invalid' AND t.subdomain=$3 AND t.settings->'smoke_test'->>'seed'=$4`, [ctx.ids.tenantId, ctx.ids.adminId, SUBDOMAIN, PREFIX])).rows[0];
  if (!actor || !ctx.actors.admin.token) throw new Error('Real synthetic administrator login and ownership required.');
  const exists = await ctx.db.query('SELECT 1 FROM finance_transactions WHERE tenant_id=$1 AND transaction_id=$2', [ctx.ids.tenantId, transactionId]);
  if (!exists.rowCount) return;
  Object.assign(process.env, { NODE_ENV: 'test', FALCON_SMOKE_ENABLE: '1', TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs', moduleResolution: 'node', resolvePackageJsonExports: false }) });
  require('reflect-metadata');
  require('ts-node/register/transpile-only');
  const { FinanceChequeService } = require(path.join(ROOT, 'src/modules/finance/finance-cheque.service.ts'));
  const db = new DataSource({ type: 'postgres', host: ctx.config.db.host, port: ctx.config.db.port, username: ctx.config.db.user, password: ctx.config.db.password, database: ctx.config.db.database, entities: [], synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();
  try {
    const result = await new FinanceChequeService(db, null).recoverApprovedSmokeCheque(ctx.ids.tenantId, transactionId);
    ctx.report.approvedSyntheticChequeRecovery = result;
    ctx.check('Exact approved synthetic cheque balance reconciled through real service', Number(result.paid_amount) === 5000 && result.status === 'PARTIALLY_PAID');
  } finally { await db.destroy(); }
}

module.exports = { recoverApprovedCheque };
