/**
 * DOFA Policy Vault — dual-key + immutable audit smoke
 * Usage: node scripts/dofa-policy-vault-api-test.js
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

function ok(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, err) {
  results.push({ name, ok: false, detail: String(err) });
  console.log(`  FAIL  ${name}: ${err}`);
}
async function req(method, pathName, token, body) {
  const res = await fetch(`${BASE}${pathName}`, {
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

function p2pGraph(l1Max = 150000) {
  const bands = [
    {
      level_no: 1,
      label: `HOD / Lab Director`,
      max_amount_inr: l1Max,
      required_roles: ['HOD', 'LabAdmin'],
      required_signatures: 1,
    },
    {
      level_no: 2,
      label: 'Dean / Campus Director',
      max_amount_inr: 200000,
      required_roles: ['Dean', 'CampusAdmin'],
      required_signatures: 1,
    },
    {
      level_no: 3,
      label: 'Joint Committee',
      max_amount_inr: 500000,
      required_roles: ['ProcurementHead', 'FinanceController'],
      required_signatures: 2,
    },
    {
      level_no: 4,
      label: 'COO',
      max_amount_inr: 1500000,
      required_roles: ['COO'],
      required_signatures: 1,
    },
    {
      level_no: 5,
      label: 'Chairman',
      max_amount_inr: null,
      required_roles: ['Chairman', 'President'],
      required_signatures: 1,
    },
  ];
  return {
    graph_json: {
      nodes: bands.map((b, i) => ({
        id: `L${b.level_no}`,
        type: 'band',
        position: { x: 80, y: i * 120 },
        data: {
          ...b,
          amount_max: b.max_amount_inr,
        },
      })),
      edges: [],
    },
    compiled_matrix: bands,
  };
}

async function main() {
  console.log(`DOFA Policy Vault test → ${BASE}\n`);
  const t = {};
  for (const [k, e] of [
    ['hod', 'hod@mygyanvihar.com'],
    ['cfo', 'cfo@mygyanvihar.com'],
    ['chairman', 'chairman@mygyanvihar.com'],
    ['admin', 'campusadmin@mygyanvihar.com'],
    ['super', 'superadmin@mygyanvihar.com'],
    ['coo', 'coo@mygyanvihar.com'],
  ]) {
    try {
      t[k] = (await login(e)).token;
      ok(`login:${k}`);
    } catch (err) {
      if (k === 'admin') {
        try {
          t.admin = (await login('superadmin@mygyanvihar.com')).token;
          ok('login:admin(via superadmin)');
        } catch {
          fail(`login:${k}`, err.message);
        }
      } else {
        fail(`login:${k}`, err.message);
      }
    }
  }

  try {
    const r = await req('POST', '/api/dofa/policy/graphs', t.hod, {
      domain: 'P2P',
      title: 'HOD sneak',
      ...p2pGraph(9999999),
      proposal_memo: 'sneak',
      minutes_ref: 'NONE',
    });
    if (r.ok) throw new Error('HOD should be forbidden');
    ok('HOD cannot POST draft', String(r.status));
  } catch (e) {
    fail('HOD cannot POST draft', e.message);
  }

  let graphId;
  try {
    const proposer = t.admin || t.super;
    const body = {
      domain: 'P2P',
      title: 'Tokamak Labs L1 raise to 1.5L',
      ...p2pGraph(150000),
      proposal_memo:
        'The ₹50k DOFA limit is bottlenecking Tokamak Labs. Requesting L1 increase to ₹1.5 Lakhs.',
      minutes_ref: 'FC-2026-Q3-VAULT-TEST',
    };
    const r = await req('POST', '/api/dofa/policy/graphs', proposer, body);
    if (!r.ok) throw new Error(`draft ${r.status}: ${JSON.stringify(r.data)}`);
    if (r.data.status !== 'DRAFT') throw new Error(`status ${r.data.status}`);
    graphId = r.data.graph_id;
    ok('IT drafts P2P raise', `graph=${String(graphId).slice(0, 8)}`);

    const sub = await req(
      'POST',
      `/api/dofa/policy/graphs/${graphId}/submit`,
      proposer,
      {},
    );
    if (!sub.ok) {
      throw new Error(`submit ${sub.status}: ${JSON.stringify(sub.data)}`);
    }
    if (sub.data.status !== 'PENDING_CFO') {
      throw new Error(`expected PENDING_CFO got ${JSON.stringify(sub.data)}`);
    }
    ok('Submit → PENDING_CFO');
  } catch (e) {
    fail('IT draft/submit', e.message);
  }

  try {
    const proposer = t.admin || t.super;
    const unlock = await req(
      'POST',
      `/api/dofa/policy/graphs/${graphId}/unlock`,
      proposer,
      { otp: '123456' },
    );
    if (unlock.ok) throw new Error('proposer should not unlock');
    ok('SoD: proposer cannot unlock', String(unlock.status));
  } catch (e) {
    fail('SoD proposer unlock', e.message);
  }

  try {
    const bad = await req('POST', `/api/dofa/policy/graphs/${graphId}/unlock`, t.cfo, {
      otp: '000000',
    });
    if (bad.ok) throw new Error('should fail without valid OTP');
    ok('CFO unlock without OTP fails', String(bad.status));

    const otpRes = await req(
      'POST',
      `/api/dofa/policy/graphs/${graphId}/request-otp`,
      t.cfo,
      {},
    );
    if (!otpRes.ok || !otpRes.data?.dev_otp) {
      throw new Error(`otp ${otpRes.status}: ${JSON.stringify(otpRes.data)}`);
    }
    ok('CFO request OTP', otpRes.data.dev_otp);

    const pub = await req('POST', `/api/dofa/policy/graphs/${graphId}/unlock`, t.cfo, {
      otp: otpRes.data.dev_otp,
    });
    if (!pub.ok) {
      throw new Error(`unlock ${pub.status}: ${JSON.stringify(pub.data)}`);
    }
    if (pub.data.status !== 'PUBLISHED') {
      throw new Error(`expected PUBLISHED got ${JSON.stringify(pub.data)}`);
    }
    ok('CFO unlock+publish', 'PUBLISHED');

    const levels = await req(
      'GET',
      '/api/operations/p2p/dofa/levels',
      t.coo || t.cfo,
    );
    if (!levels.ok) {
      throw new Error(`levels ${levels.status}: ${JSON.stringify(levels.data)}`);
    }
    const list = Array.isArray(levels.data) ? levels.data : levels.data?.levels || [];
    const l1 = list.find((x) => Number(x.level_no) === 1);
    if (!l1 || Number(l1.max_amount_inr) !== 150000) {
      throw new Error(`L1 expected 150000 got ${JSON.stringify(l1)}`);
    }
    ok('Live fin_dofa_levels L1 = 1.5L', String(l1.max_amount_inr));
  } catch (e) {
    fail('CFO unlock/publish', e.message);
  }

  try {
    const audit = await req('GET', '/api/dofa/policy/audit', t.chairman);
    if (!audit.ok || !audit.data?.length) {
      throw new Error(`audit ${audit.status}: ${JSON.stringify(audit.data)}`);
    }
    const pubRow = audit.data.find(
      (a) => a.action === 'PUBLISH' && a.graph_id === graphId,
    );
    if (!pubRow) throw new Error('PUBLISH audit missing for graph');
    ok('Audit PUBLISH row exists', pubRow.actor_role || pubRow.actor_email);

    const client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USERNAME || process.env.DB_USER || 'apple',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'university_governance',
    });
    await client.connect();
    let blocked = false;
    try {
      await client.query(
        `UPDATE dofa_policy_audit SET action = 'VIEW' WHERE audit_id = $1`,
        [pubRow.audit_id],
      );
    } catch (err) {
      blocked = /IMMUTABLE|forbidden/i.test(String(err.message));
    }
    await client.end();
    if (!blocked) throw new Error('UPDATE dofa_policy_audit should be blocked');
    ok('Audit stone immutable (UPDATE blocked)');
  } catch (e) {
    fail('Audit stone', e.message);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n======== ${passed} passed, ${failed} failed / ${results.length} total ========`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
