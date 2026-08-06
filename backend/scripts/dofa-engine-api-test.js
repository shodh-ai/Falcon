/**
 * Universal DOFA Engine API smoke
 * Usage: node scripts/dofa-engine-api-test.js
 */
const BASE = process.env.API_BASE || 'http://localhost:4000';
const TENANT = { 'x-tenant-subdomain': 'sgvu', 'Content-Type': 'application/json' };
const results = [];
function ok(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, err) {
  results.push({ name, ok: false, detail: String(err) });
  console.log(`  FAIL  ${name}: ${err}`);
}
async function req(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}
async function login(email, password = 'password123') {
  const res = await req('POST', '/api/auth/local-login', null, { email, password });
  if (!res.ok || !res.data?.token) throw new Error(`login ${email}: ${res.status}`);
  return { token: res.data.token, user: res.data.user };
}

async function main() {
  console.log(`Universal DOFA Engine test → ${BASE}\n`);
  const t = {};
  for (const [k, e] of [
    ['hod', 'hod@mygyanvihar.com'],
    ['dean', 'dean.dofa@mygyanvihar.com'],
    ['hr', 'hr@mygyanvihar.com'],
    ['cfo', 'cfo@mygyanvihar.com'],
    ['coo', 'coo@mygyanvihar.com'],
    ['chairman', 'chairman@mygyanvihar.com'],
    ['exam', 'examcell@mygyanvihar.com'],
    ['lab', 'labadmin@mygyanvihar.com'],
    ['faculty', 'faculty1@mygyanvihar.com'],
  ]) {
    try {
      t[k] = (await login(e)).token;
      ok(`login:${k}`);
    } catch (err) {
      fail(`login:${k}`, err.message);
    }
  }

  // HR hire ₹12L — Dean + HR + CFO; Chairman not required (plan path /api/hr/headcount-requests)
  let hireCase;
  try {
    const h = await req('POST', '/api/hr/headcount-requests', t.hod, {
      job_title: 'Assistant Professor',
      department: 'CSE',
      ctc_annual: 1200000,
      candidate_email: 'candidate@example.com',
      candidate_name: 'Test Candidate',
    });
    if (!h.ok) throw new Error(JSON.stringify(h.data));
    hireCase = h.data.dofa_case_id || h.data.dofa?.case_id;
    if (h.data.dofa?.status === 'ESCALATED') throw new Error('12L should not escalate');
    const steps = h.data.dofa?.steps || [];
    if (steps.length !== 3) throw new Error(`expected 3 steps got ${steps.length}`);
    ok('HR hire open under 15L', `case=${String(hireCase).slice(0, 8)} steps=3`);

    let d = await req('POST', `/api/dofa/cases/${hireCase}/decide`, t.dean, {
      decision: 'APPROVED',
    });
    if (!d.ok) throw new Error('dean: ' + JSON.stringify(d.data));
    d = await req('POST', `/api/dofa/cases/${hireCase}/decide`, t.hr, {
      decision: 'APPROVED',
    });
    if (!d.ok) throw new Error('hr: ' + JSON.stringify(d.data));
    d = await req('POST', `/api/dofa/cases/${hireCase}/decide`, t.cfo, {
      decision: 'APPROVED',
    });
    if (!d.ok || d.data.status !== 'APPROVED') {
      throw new Error('cfo final: ' + JSON.stringify(d.data));
    }
    ok('HR hire Dean+HR+CFO approved', d.data.status);
  } catch (e) {
    fail('HR hire path', e.message);
  }

  // Over 15L escalates
  try {
    const h = await req('POST', '/api/dofa/headcount', t.hod, {
      job_title: 'Senior Professor',
      ctc_annual: 2000000,
    });
    if (!h.ok) throw new Error(JSON.stringify(h.data));
    if (h.data.dofa?.status !== 'ESCALATED') {
      throw new Error(`expected ESCALATED got ${h.data.dofa?.status}`);
    }
    const ex = await req('GET', '/api/dofa/exceptions', t.chairman);
    if (!ex.ok || !ex.data?.length) throw new Error('exceptions empty');
    ok('HR hire ≥15L → Chairman exception', `n=${ex.data.length}`);
  } catch (e) {
    fail('HR hire exception', e.message);
  }

  // Grade change HOD + ExamCell
  try {
    const students = await req('GET', '/api/uos/sis/grade-changes', t.lab);
    // create with faculty/lab against a student user — use lab's tenant student from a known id
    const { Client } = require('pg');
    const client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USERNAME || 'apple',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'university_governance',
    });
    await client.connect();
    const stu = await client.query(
      `SELECT user_id FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE r.role_name='Student' AND u.is_active LIMIT 1`,
    );
    await client.end();
    const studentId = stu.rows[0]?.user_id;
    if (!studentId) throw new Error('no student');

    const g = await req('POST', '/api/uos/sis/grade-changes', t.faculty || t.lab, {
      student_user_id: studentId,
      course_code: 'CSE401',
      from_grade: 'C',
      to_grade: 'B',
      reason: 'Calculation error',
    });
    if (!g.ok) throw new Error(JSON.stringify(g.data));
    if (g.data.status === 'APPLIED') throw new Error('must not apply before DOFA');
    const caseId = g.data.dofa_case_id;
    let d = await req('POST', `/api/dofa/cases/${caseId}/decide`, t.hod, {
      decision: 'APPROVED',
    });
    if (!d.ok) throw new Error('hod grade: ' + JSON.stringify(d.data));
    d = await req('POST', `/api/dofa/cases/${caseId}/decide`, t.exam, {
      decision: 'APPROVED',
    });
    if (!d.ok || d.data.status !== 'APPROVED') {
      throw new Error('exam grade: ' + JSON.stringify(d.data));
    }
    const check = await req('GET', `/api/uos/sis/grade-changes`, t.lab);
    const row = (check.data || []).find((x) => x.change_id === g.data.change_id);
    if (!row || row.status !== 'APPLIED') {
      throw new Error(`expected APPLIED got ${row?.status}`);
    }
    ok('Grade change HOD+COE → APPLIED', row.status);
  } catch (e) {
    fail('Grade change path', e.message);
  }

  // Write-off COO + CFO
  try {
    const { Client } = require('pg');
    const client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USERNAME || 'apple',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'university_governance',
    });
    await client.connect();
    let asset = await client.query(
      `SELECT asset_id FROM university_assets WHERE status <> 'WRITTEN_OFF' LIMIT 1`,
    );
    if (!asset.rows[0]) {
      asset = await client.query(
        `INSERT INTO university_assets (tenant_id, asset_tag, asset_type, name, status)
         SELECT tenant_id, 'SGVU-BUS-TEST', 'VEHICLE', 'Old Campus Bus', 'AVAILABLE'
         FROM tenants WHERE subdomain='sgvu' RETURNING asset_id`,
      );
    }
    await client.end();
    const assetId = asset.rows[0].asset_id;
    const w = await req('POST', '/api/uos/assets/writeoffs', t.lab, {
      asset_id: assetId,
      reason: 'Beyond repair — scrap for metal',
    });
    if (!w.ok) throw new Error(JSON.stringify(w.data));
    const caseId = w.data.dofa_case_id;
    let d = await req('POST', `/api/dofa/cases/${caseId}/decide`, t.coo, {
      decision: 'APPROVED',
    });
    if (!d.ok) throw new Error('coo writeoff: ' + JSON.stringify(d.data));
    d = await req('POST', `/api/dofa/cases/${caseId}/decide`, t.cfo, {
      decision: 'APPROVED',
    });
    if (!d.ok || d.data.status !== 'APPROVED') {
      throw new Error('cfo writeoff: ' + JSON.stringify(d.data));
    }
    ok('Write-off COO+CFO', 'WRITTEN_OFF via engine');
  } catch (e) {
    fail('Write-off path', e.message);
  }

  // ESM exception via direct open
  try {
    const e = await req('POST', '/api/dofa/cases', t.coo, {
      domain: 'ESM_EXCEPTION',
      title: 'SLA test ticket 10d',
      escalate_now: true,
      exception_reason: 'Ticket open 240h',
      rule_key: 'SLA_10D',
      source_id: 'test-ticket-' + Date.now(),
    });
    if (!e.ok || e.data.status !== 'ESCALATED') {
      throw new Error(JSON.stringify(e.data));
    }
    const inbox = await req('GET', '/api/dofa/inbox', t.chairman);
    if (!inbox.ok) throw new Error(JSON.stringify(inbox.data));
    ok('ESM exception on Chairman inbox/exceptions', e.data.status);
  } catch (e) {
    fail('ESM exception', e.message);
  }

  // Unified inbox works
  try {
    const inbox = await req('GET', '/api/dofa/inbox', t.dean);
    if (!inbox.ok) throw new Error(JSON.stringify(inbox.data));
    ok('Unified inbox', `cases=${(inbox.data.cases || []).length}`);
  } catch (e) {
    fail('Unified inbox', e.message);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n======== ${passed} passed, ${failed} failed / ${results.length} total ========`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
