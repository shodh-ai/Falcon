'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { seedFinance, cents, casesFor, academicYear } = require('./finance.cjs');

const TENANT = 'c0000000-0000-4000-8000-000000000001';
const STUDENT = 'c0000000-0000-4000-8000-000000000002';
const ADMIN = 'c0000000-0000-4000-8000-000000000003';

function harness(options = {}) {
  const state = { templates: [], demands: [], transactions: [], documents: [], writes: [], uploads: [], checks: [], blocked: [], tracked: [], locks: [] };
  let counter = 10;
  const id = () => `c0000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const ctx = {
    ids: { tenantId: TENANT, studentId: STUDENT, adminId: ADMIN },
    seedDate: '2026-10-14', academicYear: '2026-2027',
    actors: { admin: { token: 'opaque-unit-test-admin-token' }, student: { token: 'opaque-unit-test-student-token' } },
    db: { async query(sql, values) {
      if (sql.includes('pg_advisory_')) { state.locks.push(sql); return { rows: [] }; }
      if (sql.includes('FROM users u JOIN student_profiles')) return { rows: [
        { user_id: STUDENT, tenant_id: options.identityTenant || TENANT, official_email: options.studentEmail || 'student@smoke.example.invalid', is_active: true, current_semester: options.semester ?? 3, batch: '2025-2029', today: '2026-10-14' },
      ] };
      if (sql.includes('FROM users WHERE')) return { rows: [
        { user_id: ADMIN, tenant_id: TENANT, official_email: options.adminEmail || 'admin@smoke.example.invalid', is_active: true },
      ] };
      if (sql.includes('FROM finance_fee_demands')) {
        return { rows: copy(state.demands.filter((row) => row.tenant_id === values[0] && row.student_user_id === values[1] && row.fee_head === values[2] && !row.deleted_at)) };
      }
      if (sql.includes('FROM finance_transactions')) {
        return { rows: copy(state.transactions.filter((row) => row.tenant_id === values[0] && row.student_user_id === values[1] && row.cheque_number === values[2] && !row.deleted_at)) };
      }
      throw new Error(`Unexpected unit-test query: ${sql}`);
    } },
    async check(name, condition, details) { state.checks.push({ name, condition, details }); },
    async blocked(name, reason) { state.blocked.push({ name, reason }); },
    async track(table, row, feature) { state.tracked.push({ table, row: copy(row), feature }); },
    async fixture() { return { name: 'SMOKE-TEST-manual-receipt.pdf', type: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nunit-test-only') }; },
    async upload(actor, path, fields, fixture) {
      assert.equal(actor, ctx.actors.admin);
      assert.equal(path, '/api/uploads/single');
      state.uploads.push({ path, fields, name: fixture.name });
      return { url: options.uploadUrl || `/uploads/${TENANT}/2026/10/${id()}.pdf` };
    },
    async ensureRow(table, values, match, feature) {
      const map = { finance_fee_templates: ['templates', 'template_id'], finance_fee_demands: ['demands', 'demand_id'], student_documents: ['documents', 'document_id'] };
      const [collection, primaryKey] = map[table] || [];
      if (!collection) throw new Error(`Unexpected fixture table ${table}`);
      let row = state[collection].find((item) => Object.entries(match).every(([key, value]) => item[key] === value));
      if (!row) {
        row = { ...copy(values), [primaryKey]: id() };
        state[collection].push(row);
        state.writes.push({ kind: 'ensureRow', table, values: copy(values) });
      }
      await ctx.track(table, row, feature);
      return copy(row);
    },
    async request(actor, method, path, body) {
      if (method !== 'GET') state.writes.push({ kind: 'api', method, path, body: copy(body) });
      if (path === '/api/finance/demands') {
        assert.equal(actor, ctx.actors.admin);
        const row = { ...copy(body), demand_id: id(), tenant_id: TENANT, paid_amount: 0, status: 'PENDING' };
        state.demands.push(row);
        return copy(row);
      }
      if (path === '/api/finance/cheques/log') {
        const row = { ...copy(body), transaction_id: id(), tenant_id: TENANT, gateway: 'CHEQUE', payment_mode: 'CHEQUE', status: 'INITIATED', cheque_status: 'PENDING_CLEARANCE', receipt_url: null };
        state.transactions.push(row);
        return copy(row);
      }
      if (path.startsWith('/api/finance/cheques/') && path.endsWith('/clear')) {
        if (options.failNextClear) { options.failNextClear = false; throw new Error('Simulated stopped API call before clearance'); }
        const row = state.transactions.find((item) => item.transaction_id === path.split('/')[4]);
        assert.ok(row);
        row.status = 'SUCCESS'; row.cheque_status = 'CLEARED'; row.clearance_date = body.clearance_date;
        const demand = state.demands.find((item) => item.demand_id === row.demand_id);
        demand.paid_amount += row.amount;
        demand.status = demand.paid_amount >= demand.total_amount ? 'PAID' : 'PARTIALLY_PAID';
        return copy(row);
      }
      if (path.startsWith('/api/finance/transactions/') && path.endsWith('/receipt')) {
        const row = state.transactions.find((item) => item.transaction_id === path.split('/')[4]);
        assert.ok(row); row.receipt_url = body.receipt_url;
        return { success: true };
      }
      if (path === '/api/student/finance') {
        assert.equal(actor, ctx.actors.student);
        const fee_structure = state.demands.map((row) => ({ ...copy(row), payable_amount: row.total_amount - row.paid_amount }));
        const pending_demands = fee_structure.filter((row) => !['PAID', 'WAIVED'].includes(row.status) && row.payable_amount > 0);
        return { fee_structure, pending_demands, payment_history: copy(state.transactions.filter((row) => row.status === 'SUCCESS')),
          total_outstanding: pending_demands.reduce((sum, row) => sum + row.payable_amount, 0) + (options.summaryDelta || 0) };
      }
      throw new Error(`Unexpected unit-test request ${method} ${path}`);
    },
  };
  return { ctx, state };
}

test('financial amounts reject invalid precision and impossible values', () => {
  assert.equal(cents('123.45'), 12345);
  assert.equal(cents(0), 0);
  for (const value of [-1, 10.001, Infinity, NaN, undefined, 'bad']) assert.throws(() => cents(value));
});

test('four synthetic fee cases use valid dates, component totals and application statuses', () => {
  const specs = casesFor('2026-10-14', 3);
  assert.equal(specs.length, 4);
  assert.equal(specs[3].due_date, '2026-10-04');
  for (const spec of specs) {
    assert.ok(spec.fee_head.startsWith('[SMOKE v1]'));
    assert.ok(spec.fee_head.length <= 40);
    assert.equal(spec.semester, 3);
    assert.equal(Object.values(spec.fee_breakup).reduce((sum, value) => sum + cents(value), 0), cents(spec.total_amount));
    assert.ok(spec.payment <= spec.total_amount);
  }
  assert.equal(academicYear('2026-10-14'), '2026-27');
  assert.equal(academicYear('2026-04-14'), '2025-26');
});

test('supported API flow in memory creates unpaid, partial, paid and overdue cases with reconciled manual receipts', async () => {
  const { ctx, state } = harness();
  const result = await seedFinance(ctx);
  assert.equal(result.expectedOutstanding, 46500);
  assert.equal(state.templates.length, 1);
  assert.equal(state.demands.length, 4);
  assert.equal(state.transactions.length, 2);
  assert.equal(state.documents.length, 2);
  assert.equal(state.uploads.length, 2);
  assert.deepEqual(state.demands.map((row) => row.status), ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE']);
  assert.equal(state.demands.reduce((sum, row) => sum + row.total_amount, 0), 61500);
  assert.equal(state.transactions.reduce((sum, row) => sum + row.amount, 0), 15000);
  assert.ok(state.checks.every((check) => check.condition));
  assert.equal(state.blocked.length, 1);
  assert.match(state.blocked[0].reason, /no external gateway callback is simulated/);
  assert.ok(state.writes.every((write) => !write.path || (!write.path.includes('webhook') && !write.path.includes('finance/pay'))));
  assert.equal(state.locks.length, 2);
});

test('rerunning creates no duplicate demand, payment, receipt document or uploaded file and never re-clears', async () => {
  const { ctx, state } = harness();
  await seedFinance(ctx);
  const writes = state.writes.length;
  const uploads = state.uploads.length;
  await seedFinance(ctx);
  assert.equal(state.writes.length, writes);
  assert.equal(state.uploads.length, uploads);
  assert.equal(state.demands.length, 4);
  assert.equal(state.transactions.length, 2);
  assert.equal(state.documents.length, 2);
  assert.equal(state.writes.filter((write) => write.path?.endsWith('/clear')).length, 2);
});

test('a paused pending-clearance run resumes without a duplicate cheque', async () => {
  const { ctx, state } = harness({ failNextClear: true });
  await assert.rejects(seedFinance(ctx), /Simulated stopped/);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].status, 'INITIATED');
  await seedFinance(ctx);
  assert.equal(state.transactions.length, 2);
  assert.equal(state.transactions.filter((row) => row.cheque_number.includes('PARTIAL')).length, 1);
  assert.equal(state.demands.find((row) => row.fee_head.includes('Partial')).paid_amount, 5000);
  assert.equal(state.locks.length, 4);
});

test('a cleared cheque with inconsistent existing paid balance stops instead of replaying clearance', async () => {
  const { ctx, state } = harness();
  await seedFinance(ctx);
  state.demands.find((row) => row.fee_head.includes('Partial')).paid_amount = 0;
  const writes = state.writes.length;
  await assert.rejects(seedFinance(ctx), /settled payment already reconciles/);
  assert.equal(state.writes.length, writes);
});

test('identity, tenant, semester and fixed-date safety failures stop before creating any fixture', async (t) => {
  const cases = [
    { options: { studentEmail: 'existing@example.com' }, expected: /Finance synthetic active Student identity/ },
    { options: { adminEmail: 'existing@example.com' }, expected: /Finance synthetic active administrator identity/ },
    { options: { identityTenant: 'c0000000-0000-4000-8000-000000000004' }, expected: /Finance synthetic active Student identity/ },
    { options: { semester: 0 }, expected: /Finance synthetic active Student identity/ },
    { mutate: (ctx) => { ctx.seedDate = '2026-02-30'; }, expected: /fixed seedDate/ },
    { mutate: (ctx) => { ctx.academicYear = 'bad'; }, expected: /academicYear/ },
  ];
  for (const [index, entry] of cases.entries()) {
    await t.test(`guard ${index + 1}`, async () => {
      const { ctx, state } = harness(entry.options);
      entry.mutate?.(ctx);
      await assert.rejects(seedFinance(ctx), entry.expected);
      assert.equal(state.writes.length, 0);
      assert.equal(state.uploads.length, 0);
    });
  }
});

test('foreign tenant receipt URLs are refused without linking a document or modifying receipt metadata', async () => {
  const { ctx, state } = harness({ uploadUrl: '/uploads/different-tenant/receipt.pdf' });
  await assert.rejects(seedFinance(ctx), /receipt upload is tenant-local/);
  assert.equal(state.documents.length, 0);
  assert.equal(state.writes.filter((write) => write.path?.endsWith('/receipt')).length, 0);
  assert.equal(state.locks.length, 2);
});

test('an API calculation mismatch is actually reported as a failed check', async () => {
  const { ctx, state } = harness({ summaryDelta: 1 });
  await assert.rejects(seedFinance(ctx), /overall outstanding summary reconciles/);
  assert.equal(state.checks.at(-1).condition, false);
  assert.equal(state.blocked.length, 0);
  assert.equal(state.locks.length, 2);
});

test('a duplicate labeled demand fails closed before any further API mutation', async () => {
  const { ctx, state } = harness();
  await seedFinance(ctx);
  state.demands.push({ ...state.demands[0], demand_id: 'c0000000-0000-4000-8000-000000000099' });
  const writes = state.writes.length;
  await assert.rejects(seedFinance(ctx), /Duplicate synthetic finance record/);
  assert.equal(state.writes.length, writes);
  assert.equal(state.locks.length, 4);
});
