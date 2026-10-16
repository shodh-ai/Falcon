#!/usr/bin/env node
'use strict';

// This deliberately does not write to any canonical Finance table.
const { Client } = require('pg');

const CODE = 'SGVU-FINANCE-DEMO-20261016';
const TYPES = ['INVOICE', 'EXPENSE', 'PAYMENT', 'JOURNAL'];
const PER_TYPE = 25;

function client() {
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });
}

function record(type, index) {
  const suffix = String(index).padStart(3, '0');
  const amount = 5000 + index * 725;
  const day = new Date(Date.UTC(2026, 9, 1 + ((index - 1) % 16)))
    .toISOString().slice(0, 10);
  const details = type === 'JOURNAL'
    ? { lines: [
      { account: 'Demo expense', debit: amount, credit: 0 },
      { account: 'Demo payable', debit: 0, credit: amount },
    ], balanced: true, posted: false }
    : type === 'PAYMENT'
      ? { gateway: 'NONE', bank_movement: false, settled: false }
      : { counterparty: `[SMOKE QA] Demo party ${suffix}`, official_obligation: false };
  return {
    type,
    reference: `${CODE}-${type}-${suffix}`,
    description: `[SMOKE QA] Simulated ${type.toLowerCase()} ${suffix} — no official posting`,
    amount,
    status: {
      INVOICE: 'DEMO_UNPAID',
      EXPENSE: 'SIMULATED_NOT_POSTED',
      PAYMENT: 'SIMULATED_NOT_SETTLED',
      JOURNAL: 'BALANCED_NOT_POSTED',
    }[type],
    day,
    details,
  };
}

async function main() {
  const db = client();
  await db.connect();
  try {
    const target = await db.query(
      `SELECT t.tenant_id,u.user_id FROM tenants t JOIN users u ON u.tenant_id=t.tenant_id
       WHERE t.subdomain=$1 AND lower(u.official_email)=$2 AND u.is_active=true`,
      ['sgvu', 'finance@mygyanvihar.com'],
    );
    if (target.rowCount !== 1) throw new Error('Expected one active SGVU Finance account');
    if (!process.argv.includes('--apply')) {
      console.log(JSON.stringify({ mode: 'plan', code: CODE, target: 'sgvu/finance@mygyanvihar.com',
        per_type: PER_TYPE, types: TYPES, official_postings: 0 }));
      return;
    }
    if (process.env.SGVU_FINANCE_DEMO_CONFIRM !== CODE) {
      throw new Error('Explicit SGVU_FINANCE_DEMO_CONFIRM is required');
    }
    const { tenant_id: tenantId, user_id: userId } = target.rows[0];
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [CODE]);
    await db.query(
      `INSERT INTO finance_demo_books(tenant_id,owner_user_id,code,title)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(tenant_id,owner_user_id,code) DO NOTHING`,
      [tenantId, userId, CODE, 'SGVU Finance demonstration book — synthetic data only'],
    );
    const bookRows = await db.query(
      `SELECT book_id FROM finance_demo_books
       WHERE tenant_id=$1 AND owner_user_id=$2 AND code=$3`,
      [tenantId, userId, CODE],
    );
    const bookId = bookRows.rows[0].book_id;
    for (const type of TYPES) {
      for (let index = 1; index <= PER_TYPE; index++) {
        const row = record(type, index);
        await db.query(
          `INSERT INTO finance_demo_records
             (book_id,record_type,reference,description,amount,status,occurred_on,details)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
           ON CONFLICT(book_id,record_type,reference) DO NOTHING`,
          [bookId, row.type, row.reference, row.description, row.amount,
            row.status, row.day, JSON.stringify(row.details)],
        );
      }
    }
    const counts = await db.query(
      `SELECT record_type,count(*)::int AS count FROM finance_demo_records
       WHERE book_id=$1 GROUP BY record_type`,
      [bookId],
    );
    if (counts.rowCount !== TYPES.length || counts.rows.some((row) => row.count !== PER_TYPE)) {
      throw new Error('Demo record count mismatch; rolled back');
    }
    await db.query('COMMIT');
    console.log(JSON.stringify({ mode: 'applied', code: CODE, book_id: bookId,
      counts: counts.rows, official_postings: 0 }));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
