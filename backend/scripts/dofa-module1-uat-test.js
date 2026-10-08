/**
 * MODULE 1 UAT — Constitution Vault (Dual-Key Security)
 * Usage: node scripts/dofa-module1-uat-test.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile();

const BASE = process.env.API_BASE || 'http://localhost:4000';
const TENANT = { 'x-tenant-subdomain': 'sgvu', 'Content-Type': 'application/json' };
const results = [];

function pass(id, name, detail = '') {
  results.push({ id, ok: true, name, detail });
  console.log(`  PASS  [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(id, name, err) {
  results.push({ id, ok: false, name, detail: String(err) });
  console.log(`  FAIL  [${id}] ${name}: ${err}`);
}

async function req(method, pathName, token, body) {
  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers: { ...TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { status: res.status, ok: res.ok, data };
}

async function login(email) {
  const res = await req('POST', '/api/auth/local-login', null, {
    email,
    password: 'password123',
  });
  if (!res.ok || !res.data?.token) throw new Error(`login ${email}: ${res.status}`);
  return res.data.token;
}

function p2pGraph(l1Max) {
  const bands = [
    {
      level_no: 1,
      label: 'HOD / Lab Director',
      max_amount_inr: l1Max,
      required_roles: ['HOD', 'LabAdmin'],
      required_signatures: 1,
    },
    {
      level_no: 2,
      label: 'Dean / Campus Director',
      max_amount_inr: 500000,
      required_roles: ['Dean', 'CampusAdmin'],
      required_signatures: 1,
    },
  ];
  return {
    graph_json: {
      nodes: bands.map((b, i) => ({
        id: `L${b.level_no}`,
        type: 'band',
        position: { x: 80, y: i * 120 },
        data: { ...b, amount_max: b.max_amount_inr },
      })),
      edges: [],
    },
    compiled_matrix: bands,
  };
}

async function liveL1(token) {
  const res = await req('GET', '/api/operations/p2p/dofa/levels', token);
  const list = Array.isArray(res.data) ? res.data : res.data?.levels || [];
  const l1 = list.find((x) => Number(x.level_no) === 1);
  return l1 ? Number(l1.max_amount_inr) : null;
}

async function main() {
  console.log(`MODULE 1 — Constitution Vault UAT → ${BASE}\n`);

  const admin = await login('campusadmin@mygyanvihar.com');
  const cfo = await login('cfo@mygyanvihar.com');
  const chairman = await login('chairman@mygyanvihar.com');
  const hod = await login('hod@mygyanvihar.com');

  const TARGET_L1 = 175000;
  const beforeL1 = await liveL1(admin);
  pass('1.1', 'Baseline live L1 captured', String(beforeL1));

  const draft = await req('POST', '/api/dofa/policy/graphs', admin, {
    domain: 'P2P',
    title: `Module1 UAT L1 ${TARGET_L1}`,
    ...p2pGraph(TARGET_L1),
    proposal_memo: 'Module 1 automated UAT — raise L1 to ₹1.75L',
    minutes_ref: 'FC-2026-MOD1-UAT',
  });
  if (!draft.ok || draft.data.status !== 'DRAFT') {
    fail('1.1', 'IT creates DRAFT', JSON.stringify(draft.data));
    process.exit(1);
  }
  const graphId = draft.data.graph_id;
  pass('1.1', 'IT drafts rule change', `status=DRAFT graph=${String(graphId).slice(0, 8)}`);

  const submit = await req(
    'POST',
    `/api/dofa/policy/graphs/${graphId}/submit`,
    admin,
    {},
  );
  if (!submit.ok || submit.data.status !== 'PENDING_CFO') {
    fail('1.1', 'Submit → PENDING_CFO', JSON.stringify(submit.data));
  } else {
    pass('1.1', 'IT cannot force-publish', `status=${submit.data.status}`);
  }

  const midL1 = await liveL1(admin);
  if (midL1 === TARGET_L1) {
    fail('1.1', 'Live matrix unchanged while pending', `live jumped to ${midL1}`);
  } else {
    pass(
      '1.1',
      'Live matrix NOT changed while pending',
      `live L1=${midL1}, draft wants ${TARGET_L1}`,
    );
  }

  const itOtp = await req(
    'POST',
    `/api/dofa/policy/graphs/${graphId}/request-otp`,
    admin,
    {},
  );
  if (itOtp.ok) fail('1.3', 'IT cannot request OTP', 'got 200');
  else pass('1.3', 'IT blocked from unlock/OTP', String(itOtp.status));

  const cfoDraft = await req('POST', '/api/dofa/policy/graphs', cfo, {
    domain: 'P2P',
    title: 'CFO sneak',
    ...p2pGraph(999999),
    proposal_memo: 'x',
    minutes_ref: 'x',
  });
  if (cfoDraft.ok) fail('1.3', 'CFO cannot draft', 'got 200');
  else pass('1.3', 'CFO blocked from drafting', String(cfoDraft.status));

  const hodDraft = await req('POST', '/api/dofa/policy/graphs', hod, {
    domain: 'P2P',
    title: 'HOD sneak',
    ...p2pGraph(1),
    proposal_memo: 'x',
    minutes_ref: 'x',
  });
  if (hodDraft.ok) fail('1.3', 'HOD cannot draft', 'got 200');
  else pass('1.3', 'HOD blocked from drafting', String(hodDraft.status));

  const proposerUnlock = await req(
    'POST',
    `/api/dofa/policy/graphs/${graphId}/unlock`,
    admin,
    { otp: '000000' },
  );
  if (proposerUnlock.ok) fail('1.3', 'IT cannot unlock', 'got 200');
  else pass('1.3', 'IT blocked from unlock/publish', String(proposerUnlock.status));

  const otpRes = await req(
    'POST',
    `/api/dofa/policy/graphs/${graphId}/request-otp`,
    cfo,
    {},
  );
  if (!otpRes.ok || !otpRes.data?.dev_otp) {
    fail('1.2', 'CFO request OTP', JSON.stringify(otpRes.data));
  } else {
    pass('1.2', 'CFO requests OTP', `dev_otp=${otpRes.data.dev_otp}`);
  }

  const pub = await req('POST', `/api/dofa/policy/graphs/${graphId}/unlock`, cfo, {
    otp: otpRes.data?.dev_otp,
  });
  if (!pub.ok || pub.data.status !== 'PUBLISHED') {
    fail('1.2', 'CFO Unlock & Publish', JSON.stringify(pub.data));
  } else {
    pass('1.2', 'CFO Unlock & Publish', 'status=PUBLISHED');
  }

  const afterL1 = await liveL1(admin);
  if (afterL1 !== TARGET_L1) {
    fail('1.2', 'Live matrix updated after publish', `expected ${TARGET_L1} got ${afterL1}`);
  } else {
    pass('1.2', 'Live L1 now accepts new limit', `₹${afterL1.toLocaleString('en-IN')}`);
  }

  const audit = await req(
    'GET',
    `/api/dofa/policy/audit?graph_id=${graphId}`,
    chairman,
  );
  if (!audit.ok || !audit.data?.length) {
    fail('1.4', 'Chairman reads audit log', JSON.stringify(audit.data));
  } else {
    pass('1.4', 'Chairman audit API accessible', `rows=${audit.data.length}`);
  }

  const rows = audit.data || [];
  const actions = rows.map((a) => a.action).join(', ');

  if (
    !rows.some(
      (a) => a.action === 'PROPOSE' && /campusadmin@/i.test(a.actor_email || ''),
    )
  ) {
    fail('1.4', 'Audit: IT PROPOSE with campusadmin@', actions);
  } else {
    pass('1.4', 'Audit stone: IT proposer recorded', 'campusadmin@');
  }

  if (!rows.some((a) => a.action === 'SUBMIT')) {
    fail('1.4', 'Audit: SUBMIT row', actions);
  } else {
    pass('1.4', 'Audit stone: SUBMIT recorded');
  }

  if (
    !rows.some(
      (a) =>
        ['PUBLISH', 'UNLOCK'].includes(a.action) &&
        /cfo@/i.test(a.actor_email || ''),
    )
  ) {
    fail('1.4', 'Audit: CFO unlock/publish', actions);
  } else {
    pass('1.4', 'Audit stone: CFO unlocker recorded', 'cfo@');
  }

  if (!rows.every((a) => a.created_at)) {
    fail('1.4', 'Audit timestamps on all rows');
  } else {
    pass('1.4', 'Audit timestamps present on all rows');
  }

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database:
      process.env.DB_DATABASE || process.env.DB_NAME || 'university_governance',
  });
  await client.connect();
  const auditRow = rows.find((a) => a.action === 'PUBLISH') || rows[0];
  let updBlocked = false;
  let delBlocked = false;
  try {
    await client.query(
      `UPDATE dofa_policy_audit SET action = 'VIEW' WHERE audit_id = $1`,
      [auditRow.audit_id],
    );
  } catch (err) {
    updBlocked = /IMMUTABLE|forbidden/i.test(String(err.message));
  }
  try {
    await client.query(`DELETE FROM dofa_policy_audit WHERE audit_id = $1`, [
      auditRow.audit_id,
    ]);
  } catch (err) {
    delBlocked = /IMMUTABLE|forbidden/i.test(String(err.message));
  }
  await client.end();

  if (!updBlocked) fail('1.4', 'DB rejects UPDATE on dofa_policy_audit');
  else pass('1.4', 'Immutable audit: UPDATE blocked');

  if (!delBlocked) fail('1.4', 'DB rejects DELETE on dofa_policy_audit');
  else pass('1.4', 'Immutable audit: DELETE blocked');

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `\n======== MODULE 1 COMPLETE: ${passed} passed, ${failed} failed / ${results.length} checks ========`,
  );
  if (failed) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  ✗ [${r.id}] ${r.name}: ${r.detail}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
