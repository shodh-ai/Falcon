'use strict';

// Local synthetic fixtures only. The runner verifies the database/environment
// before calling this module; this module also fails closed on identity drift.
const PREFIX = '[SMOKE v1]';
const FEATURE = 'finance';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cents(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || Math.abs(numeric * 100 - Math.round(numeric * 100)) > 0.00001) {
    throw new Error('Smoke finance amount must be a nonnegative two-decimal number');
  }
  return Math.round(numeric * 100);
}

function dateOffset(today, days) {
  const date = new Date(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new Error('Database did not supply a valid current date');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function academicYear(today) {
  const date = new Date(`${today}T00:00:00.000Z`);
  const start = date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
  return `${start}-${String(start + 1).slice(-2)}`;
}

function isoDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

function casesFor(today, semester) {
  return [
    { key: 'unpaid', fee_head: `${PREFIX} Unpaid semester fee`, total_amount: 30000, payment: 0, semester, due_date: dateOffset(today, 21), fee_breakup: { tuition_fee: 25000, development_fee: 3000, exam_fee: 2000 } },
    { key: 'partial', fee_head: `${PREFIX} Partial semester fee`, total_amount: 20000, payment: 5000, semester, due_date: dateOffset(today, 14), fee_breakup: { tuition_fee: 17000, development_fee: 2000, exam_fee: 1000 } },
    { key: 'paid', fee_head: `${PREFIX} Paid semester fee`, total_amount: 10000, payment: 10000, semester, due_date: dateOffset(today, 14), fee_breakup: { tuition_fee: 8000, development_fee: 1000, exam_fee: 1000 } },
    { key: 'overdue', fee_head: `${PREFIX} Overdue exam fee`, total_amount: 1500, payment: 0, semester, due_date: dateOffset(today, -10), fee_breakup: { exam_fee: 1500 } },
  ];
}

async function requireCheck(ctx, name, condition, details) {
  await ctx.check(name, Boolean(condition), details);
  if (!condition) throw new Error(`Smoke finance safety check failed: ${name}`);
}

async function one(ctx, sql, params, label) {
  const result = await ctx.db.query(sql, params);
  if (result.rows.length > 1) throw new Error(`Duplicate synthetic finance record: ${label}`);
  return result.rows[0];
}

async function demandByHead(ctx, head) {
  return one(ctx,
    `SELECT * FROM finance_fee_demands WHERE tenant_id=$1 AND student_user_id=$2 AND fee_head=$3 AND deleted_at IS NULL`,
    [ctx.ids.tenantId, ctx.ids.studentId, head], head);
}

async function verifyDemand(ctx, demand, spec, year) {
  const components = Object.values(spec.fee_breakup).reduce((total, amount) => total + cents(amount), 0);
  await requireCheck(ctx, `${spec.key} fee components reconcile`, components === cents(spec.total_amount), { total: spec.total_amount });
  await requireCheck(ctx, `${spec.key} demand ownership and mandatory fields`,
    UUID.test(demand?.demand_id || '') && demand.tenant_id === ctx.ids.tenantId && demand.student_user_id === ctx.ids.studentId &&
    demand.fee_head === spec.fee_head && demand.academic_year === year && Number(demand.semester) === spec.semester &&
    cents(demand.total_amount) === cents(spec.total_amount) && cents(demand.paid_amount) <= cents(demand.total_amount) &&
    isoDate(demand.due_date) === spec.due_date &&
    ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WAIVED'].includes(demand.status), { demand_id: demand?.demand_id });
  for (const [key, value] of Object.entries(spec.fee_breakup)) {
    await requireCheck(ctx, `${spec.key} ${key} retained`, cents(demand.fee_breakup?.[key]) === cents(value), { demand_id: demand.demand_id });
  }
}

async function createDemand(ctx, spec, year) {
  let demand = await demandByHead(ctx, spec.fee_head);
  if (!demand) {
    const values = { tenant_id: ctx.ids.tenantId, student_user_id: ctx.ids.studentId, fee_head: spec.fee_head, academic_year: year,
      semester: spec.semester, total_amount: spec.total_amount, paid_amount: 0, due_date: spec.due_date, status: spec.key === 'overdue' ? 'OVERDUE' : 'PENDING', fee_breakup: spec.fee_breakup };
    if (spec.key === 'overdue') {
      // No per-student overdue API exists. Insert this dedicated fixture in the
      // exact overdue state supported by the entity/cron; never invoke the
      // global sweep, which would change unrelated existing demands.
      await requireCheck(ctx, 'Overdue fixture date precedes seed date and starts unpaid', spec.due_date < ctx.seedDate && values.paid_amount === 0, {});
      demand = await ctx.ensureRow('finance_fee_demands', values,
        { tenant_id: ctx.ids.tenantId, student_user_id: ctx.ids.studentId, fee_head: spec.fee_head }, FEATURE);
    } else {
      const { tenant_id, paid_amount, status, ...body } = values;
      demand = await ctx.request(ctx.actors.admin, 'POST', '/api/finance/demands', body);
      await ctx.track('finance_fee_demands', demand, FEATURE, true);
    }
  } else {
    await ctx.track('finance_fee_demands', demand, FEATURE);
  }
  await verifyDemand(ctx, demand, spec, year);
  return demand;
}

async function verifyCheque(ctx, transaction, demand, spec, reference) {
  await requireCheck(ctx, `${spec.key} cheque ownership and amount`,
    UUID.test(transaction?.transaction_id || '') && transaction.tenant_id === ctx.ids.tenantId &&
    transaction.student_user_id === ctx.ids.studentId && transaction.demand_id === demand.demand_id &&
    transaction.gateway === 'CHEQUE' && transaction.payment_mode === 'CHEQUE' && transaction.cheque_number === reference &&
    cents(transaction.amount) === cents(spec.payment), { transaction_id: transaction?.transaction_id });
}

async function createAndClearCheque(ctx, demand, spec, today) {
  const reference = `${PREFIX} ${spec.key.toUpperCase()}-${ctx.ids.studentId.slice(0, 8)}`;
  let transaction = await one(ctx,
    `SELECT * FROM finance_transactions WHERE tenant_id=$1 AND student_user_id=$2 AND cheque_number=$3 AND deleted_at IS NULL`,
    [ctx.ids.tenantId, ctx.ids.studentId, reference], reference);
  if (!transaction) {
    await requireCheck(ctx, `${spec.key} new payment has no preexisting paid balance`, cents(demand.paid_amount) === 0 && demand.status === 'PENDING', { demand_id: demand.demand_id });
    await ctx.request(ctx.actors.admin, 'POST', '/api/finance/cheques/log', {
      student_user_id: ctx.ids.studentId, demand_id: demand.demand_id, amount: spec.payment,
      cheque_number: reference, bank_name: `${PREFIX} Fictional Campus Test Bank`,
    });
    transaction = await one(ctx,
      'SELECT * FROM finance_transactions WHERE tenant_id=$1 AND student_user_id=$2 AND cheque_number=$3 AND deleted_at IS NULL',
      [ctx.ids.tenantId, ctx.ids.studentId, reference], reference);
    await ctx.track('finance_transactions', transaction, FEATURE, true);
  } else {
    await ctx.track('finance_transactions', transaction, FEATURE);
  }
  await verifyCheque(ctx, transaction, demand, spec, reference);
  if (transaction.status === 'SUCCESS' && transaction.cheque_status === 'CLEARED') {
    // The application clear endpoint increments paid_amount on every call.
    // Never replay it for an already cleared transaction.
    await requireCheck(ctx, `${spec.key} settled payment already reconciles`, cents(demand.paid_amount) === cents(spec.payment), { demand_id: demand.demand_id });
    return transaction;
  }
  await requireCheck(ctx, `${spec.key} cheque can be cleared exactly once`,
    transaction.status === 'INITIATED' && transaction.cheque_status === 'PENDING_CLEARANCE' &&
    demand.status === 'PENDING' && cents(demand.paid_amount) === 0 && cents(spec.payment) <= cents(demand.total_amount), { transaction_id: transaction.transaction_id });
  // Re-read immediately before the incrementing API so a stopped/failed prior
  // run never turns into another payment. The module's advisory lock also
  // serializes two cooperating seed runs for this dedicated student.
  const current = await demandByHead(ctx, spec.fee_head);
  await requireCheck(ctx, `${spec.key} remaining balance before clearance`,
    current?.demand_id === demand.demand_id && current.status === 'PENDING' && cents(current.paid_amount) === 0 &&
    cents(current.total_amount) - cents(current.paid_amount) >= cents(transaction.amount), { demand_id: demand.demand_id });
  const currentTransaction = await one(ctx,
    `SELECT * FROM finance_transactions WHERE tenant_id=$1 AND student_user_id=$2 AND cheque_number=$3 AND deleted_at IS NULL`,
    [ctx.ids.tenantId, ctx.ids.studentId, reference], reference);
  await verifyCheque(ctx, currentTransaction, current, spec, reference);
  await requireCheck(ctx, `${spec.key} pending cheque rechecked before clearance`,
    currentTransaction.status === 'INITIATED' && currentTransaction.cheque_status === 'PENDING_CLEARANCE', { transaction_id: currentTransaction.transaction_id });
  await ctx.request(ctx.actors.admin, 'PATCH', `/api/finance/cheques/${transaction.transaction_id}/clear`, { clearance_date: today });
  transaction = await one(ctx,
    'SELECT * FROM finance_transactions WHERE tenant_id=$1 AND student_user_id=$2 AND cheque_number=$3 AND deleted_at IS NULL',
    [ctx.ids.tenantId, ctx.ids.studentId, reference], reference);
  await verifyCheque(ctx, transaction, demand, spec, reference);
  await requireCheck(ctx, `${spec.key} manual cheque cleared`, transaction.status === 'SUCCESS' && transaction.cheque_status === 'CLEARED', { transaction_id: transaction.transaction_id });
  return transaction;
}

async function attachManualReceipt(ctx, transaction, demand, spec) {
  let receiptUrl = transaction.receipt_url;
  if (!receiptUrl) {
    const fixture = await ctx.fixture('receipt', {
      synthetic: true, studentUserId: ctx.ids.studentId, demandId: demand.demand_id,
      transactionId: transaction.transaction_id, amount: spec.payment, feeHead: spec.fee_head,
      paymentMode: 'CHEQUE', receiptNumber: `SMOKE-${transaction.transaction_id}`, date: ctx.seedDate,
    });
    await requireCheck(ctx, `${spec.key} receipt fixture is a nonempty PDF`,
      fixture?.type === 'application/pdf' && Buffer.isBuffer(fixture.buffer) && fixture.buffer.subarray(0, 5).toString() === '%PDF-', {});
    const upload = await ctx.upload(ctx.actors.admin, '/api/uploads/single', { smoke_test_reference: transaction.transaction_id },
      { ...fixture, name: `SMOKE-TEST-manual-receipt-${transaction.transaction_id}.pdf` });
    receiptUrl = upload?.url;
    await requireCheck(ctx, `${spec.key} receipt upload is tenant-local`,
      typeof receiptUrl === 'string' && receiptUrl.startsWith(`/uploads/${ctx.ids.tenantId}/`) && !receiptUrl.includes('..'), {});
    await ctx.request(ctx.actors.admin, 'PATCH', `/api/finance/transactions/${transaction.transaction_id}/receipt`, { receipt_url: receiptUrl });
  }
  await requireCheck(ctx, `${spec.key} receipt belongs to synthetic tenant`,
    typeof receiptUrl === 'string' && receiptUrl.startsWith(`/uploads/${ctx.ids.tenantId}/`) && !receiptUrl.includes('..'), { transaction_id: transaction.transaction_id });
  const title = `${PREFIX} ${spec.key === 'paid' ? 'Fully paid' : 'Partial payment'} Test receipt`;
  const document = await ctx.ensureRow('student_documents', {
    tenant_id: ctx.ids.tenantId, student_user_id: ctx.ids.studentId, category: 'FEE_RECEIPTS', title,
    file_url: receiptUrl, source_transaction_id: transaction.transaction_id,
  }, { tenant_id: ctx.ids.tenantId, student_user_id: ctx.ids.studentId, source_transaction_id: transaction.transaction_id, category: 'FEE_RECEIPTS' }, FEATURE);
  await requireCheck(ctx, `${spec.key} receipt document linkage`, document.file_url === receiptUrl && document.title === title &&
    document.student_user_id === ctx.ids.studentId && document.tenant_id === ctx.ids.tenantId && document.source_transaction_id === transaction.transaction_id, { document_id: document.document_id });
  return { ...transaction, receipt_url: receiptUrl };
}

async function seedFinance(ctx) {
  for (const method of ['request', 'upload', 'ensureRow', 'track', 'fixture', 'check', 'blocked']) {
    if (typeof ctx?.[method] !== 'function') throw new Error(`Smoke finance context requires ${method}`);
  }
  if (!ctx.db?.query || !ctx.actors?.admin || !ctx.actors?.student || !UUID.test(ctx.ids?.tenantId || '') ||
      !UUID.test(ctx.ids?.studentId || '') || !UUID.test(ctx.ids?.adminId || '') || ctx.ids.studentId === ctx.ids.adminId) {
    throw new Error('Smoke finance context requires distinct validated synthetic identities');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.seedDate || '') || dateOffset(ctx.seedDate, 0) !== ctx.seedDate ||
      typeof ctx.academicYear !== 'string' || !/^\d{4}-\d{2,4}$/.test(ctx.academicYear) || ctx.academicYear.length > 12) {
    throw new Error('Smoke finance requires the runner fixed seedDate and validated academicYear');
  }
  const identity = await one(ctx,
    `SELECT u.user_id,u.tenant_id,u.official_email,u.is_active,sp.current_semester,sp.batch,CURRENT_DATE::text AS today
     FROM users u JOIN student_profiles sp ON sp.user_id=u.user_id AND sp.tenant_id=u.tenant_id
     WHERE u.user_id=$1 AND u.tenant_id=$2 AND u.deleted_at IS NULL AND sp.deleted_at IS NULL
       AND (EXISTS (SELECT 1 FROM roles r WHERE r.role_id=u.role_id AND r.role_name='Student')
         OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id=ur.role_id WHERE ur.user_id=u.user_id AND r.role_name='Student'))`,
    [ctx.ids.studentId, ctx.ids.tenantId], 'synthetic student profile');
  await requireCheck(ctx, 'Finance synthetic active Student identity', identity?.is_active === true &&
    identity.tenant_id === ctx.ids.tenantId && identity.user_id === ctx.ids.studentId &&
    typeof identity.official_email === 'string' && identity.official_email.toLowerCase().endsWith('.invalid') &&
    Number.isInteger(Number(identity.current_semester)) && Number(identity.current_semester) > 0 && Number(identity.current_semester) <= 16,
  { student_user_id: ctx.ids.studentId });
  const administrator = await one(ctx,
    `SELECT user_id,tenant_id,official_email,is_active FROM users WHERE user_id=$1 AND tenant_id=$2 AND deleted_at IS NULL`,
    [ctx.ids.adminId, ctx.ids.tenantId], 'synthetic finance administrator');
  await requireCheck(ctx, 'Finance synthetic active administrator identity', administrator?.is_active === true &&
    administrator.tenant_id === ctx.ids.tenantId && administrator.user_id === ctx.ids.adminId &&
    typeof administrator.official_email === 'string' && administrator.official_email.toLowerCase().endsWith('.invalid'),
  { administrator_user_id: ctx.ids.adminId });

  const lockKey = `falcon-student-smoke-finance:${ctx.ids.tenantId}:${ctx.ids.studentId}`;
  await ctx.db.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [lockKey]);
  try {
    const year = ctx.academicYear;
    const specs = casesFor(ctx.seedDate, Number(identity.current_semester));
    const templateName = `${PREFIX} Semester fee structure`;
    const template = await ctx.ensureRow('finance_fee_templates', {
      tenant_id: ctx.ids.tenantId, template_name: templateName, academic_year: year,
      semester: Number(identity.current_semester), fee_breakup: specs[0].fee_breakup, total_amount: specs[0].total_amount, is_active: true,
    }, { tenant_id: ctx.ids.tenantId, template_name: templateName }, FEATURE);
    await requireCheck(ctx, 'Fee structure template totals', template.tenant_id === ctx.ids.tenantId &&
      template.academic_year === year && Number(template.semester) === Number(identity.current_semester) &&
      cents(template.total_amount) === cents(specs[0].total_amount) &&
      Object.entries(specs[0].fee_breakup).every(([key, value]) => cents(template.fee_breakup?.[key]) === cents(value)), { template_id: template.template_id });

    const demands = [];
    const transactions = [];
    for (const spec of specs) {
      let demand = await createDemand(ctx, spec, year);
      if (spec.payment) {
        let transaction = await createAndClearCheque(ctx, demand, spec, ctx.seedDate);
        transaction = await attachManualReceipt(ctx, transaction, demand, spec);
        transactions.push(transaction);
        demand = await demandByHead(ctx, spec.fee_head);
      }
      await requireCheck(ctx, `${spec.key} final demand payment balance`, cents(demand.paid_amount) === cents(spec.payment) &&
        demand.status === (spec.key === 'paid' ? 'PAID' : spec.key === 'partial' ? 'PARTIALLY_PAID' : spec.key === 'overdue' ? 'OVERDUE' : 'PENDING'),
      { demand_id: demand.demand_id, total_amount: spec.total_amount, paid_amount: spec.payment, outstanding: spec.total_amount - spec.payment });
      demands.push(demand);
    }
    const ledger = await ctx.request(ctx.actors.student, 'GET', '/api/student/finance');
    const expectedOutstanding = specs.reduce((total, spec) => total + spec.total_amount - spec.payment, 0);
    await requireCheck(ctx, 'Student fee cases appear in real Finance API', Array.isArray(ledger.fee_structure) &&
      demands.every((demand) => ledger.fee_structure.some((row) => row.demand_id === demand.demand_id && cents(row.paid_amount) === cents(demand.paid_amount))), { expected_fixture_demands: demands.length });
    await requireCheck(ctx, 'Student payment history contains both manual receipts', Array.isArray(ledger.payment_history) &&
      transactions.every((transaction) => ledger.payment_history.some((row) => row.transaction_id === transaction.transaction_id &&
        row.receipt_url === transaction.receipt_url && cents(row.amount) === cents(transaction.amount))), { expected_fixture_payments: transactions.length });
    const fixtureOutstanding = ledger.fee_structure.filter((row) => demands.some((demand) => demand.demand_id === row.demand_id))
      .reduce((total, row) => total + cents(row.payable_amount), 0);
    await requireCheck(ctx, 'Synthetic fee totals reconcile in Student API', fixtureOutstanding === cents(expectedOutstanding), { expected_outstanding: expectedOutstanding });
    const allOutstanding = ledger.pending_demands.reduce((total, row) => total + cents(row.payable_amount), 0);
    await requireCheck(ctx, 'Student overall outstanding summary reconciles', cents(ledger.total_outstanding) === allOutstanding, { total_outstanding: ledger.total_outstanding });
    await ctx.blocked('Native Student gateway settlement and automatic receipt',
      'Not exercised: no external gateway callback is simulated. Existing Student checkout inserts omit finance_transactions.tenant_id (student-portal.service.ts:1604,1688); existing FinanceReceiptService draws the unsupported rupee glyph with Helvetica (finance-receipt.service.ts:101). These fixtures use supported manual cheque and receipt-attachment APIs instead.');
    return { template, demands, transactions, expectedOutstanding };
  } finally {
    await ctx.db.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey]);
  }
}

module.exports = { seedFinance, casesFor, cents, academicYear };
