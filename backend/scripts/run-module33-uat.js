/**
 * Module 3.3 asset write-off UAT — end-to-end
 */
const BASE = process.env.API_BASE || 'http://localhost:4000';
const TENANT = { 'x-tenant-subdomain': 'sgvu', 'Content-Type': 'application/json' };

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

async function login(email) {
  const r = await req('POST', '/api/auth/local-login', null, {
    email,
    password: 'password123',
  });
  if (!r.ok || !r.data?.token) {
    throw new Error(`login ${email}: ${JSON.stringify(r.data)}`);
  }
  return r.data.token;
}

async function ensureAsset(labToken) {
  const [assetsRes, writeoffsRes] = await Promise.all([
    req('GET', '/api/admin-ops/assets', labToken),
    req('GET', '/api/uos/assets/writeoffs', labToken),
  ]);
  const assets = Array.isArray(assetsRes.data) ? assetsRes.data : [];
  const writeoffs = Array.isArray(writeoffsRes.data) ? writeoffsRes.data : [];
  const writtenOffIds = new Set(
    writeoffs.filter((w) => w.status === 'WRITTEN_OFF').map((w) => w.asset_id),
  );
  const fromApi = assets.find(
    (a) => a.status !== 'WRITTEN_OFF' && !writtenOffIds.has(a.asset_id),
  );
  if (fromApi?.asset_id) return { assetId: fromApi.asset_id, source: 'api', tag: fromApi.asset_tag };

  const { Client } = require('pg');
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'apple',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'university_governance',
  });
  await client.connect();
  let row = await client.query(
    `SELECT asset_id, asset_tag, status FROM university_assets
     WHERE status != 'WRITTEN_OFF' LIMIT 1`,
  );
  if (!row.rows[0]) {
    row = await client.query(
      `INSERT INTO university_assets (tenant_id, asset_tag, asset_type, name, status)
       SELECT tenant_id, 'SGVU-UAT-WRITEOFF', 'EQUIPMENT', 'UAT Test Microscope', 'AVAILABLE'
       FROM tenants WHERE subdomain = 'sgvu'
       RETURNING asset_id, asset_tag, status`,
    );
  }
  await client.end();
  return { assetId: row.rows[0].asset_id, source: 'db', tag: row.rows[0].asset_tag };
}

async function main() {
  const lab = await login('labadmin@mygyanvihar.com');
  const coo = await login('coo@mygyanvihar.com');
  const cfo = await login('cfo@mygyanvihar.com');
  console.log('Logins OK');

  const { assetId, source, tag } = await ensureAsset(lab);
  console.log('Asset', assetId, tag || '', `(${source})`);

  const w = await req('POST', '/api/uos/assets/writeoffs', lab, {
    asset_id: assetId,
    reason: 'End of life / unserviceable — UAT 3.3',
  });
  if (!w.ok) throw new Error(`create writeoff: ${JSON.stringify(w.data)}`);
  const caseId = w.data.dofa_case_id;
  console.log('Writeoff', w.data.writeoff_id, 'case', caseId);

  let d = await req('POST', `/api/dofa/cases/${caseId}/decide`, coo, {
    decision: 'APPROVED',
  });
  if (!d.ok) throw new Error(`coo: ${JSON.stringify(d.data)}`);
  console.log('COO approved -> step', d.data.current_step);

  d = await req('POST', `/api/dofa/cases/${caseId}/decide`, cfo, {
    decision: 'APPROVED',
  });
  if (!d.ok) throw new Error(`cfo: ${JSON.stringify(d.data)}`);
  console.log('CFO approved -> status', d.data.status);

  const list = await req('GET', '/api/uos/assets/writeoffs', lab);
  const row = (list.data || []).find((x) => x.writeoff_id === w.data.writeoff_id);
  console.log('Writeoff status:', row?.status);
  if (row?.status !== 'WRITTEN_OFF') {
    throw new Error(`expected WRITTEN_OFF got ${row?.status}`);
  }

  const assetsAfter = await req('GET', '/api/admin-ops/assets', lab);
  const asset = (assetsAfter.data || []).find((a) => a.asset_id === assetId);
  if (asset && asset.status !== 'WRITTEN_OFF') {
    throw new Error(`asset not WRITTEN_OFF: ${asset.status}`);
  }
  console.log('Asset status:', asset?.status ?? 'not in list (ok if written off filtered)');

  const cooInbox = await req('GET', '/api/dofa/inbox', coo);
  const cfoInbox = await req('GET', '/api/dofa/inbox', cfo);
  console.log('COO inbox cases:', (cooInbox.data?.cases || []).length);
  console.log('CFO inbox cases:', (cfoInbox.data?.cases || []).length);
  console.log('MODULE 3.3 PIPELINE COMPLETE');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
