/**
 * Digital DOFA v2 — four departments + five-level hierarchy API tests.
 * Usage: node scripts/digital-dofa-api-test.js
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
    headers: {
      ...TENANT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
  if (!res.ok || !res.data?.token) {
    throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data.token;
}

async function main() {
  console.log(`Digital DOFA v2 API test → ${BASE}\n`);

  const tokens = {};
  const personas = [
    ['lab', 'labadmin@mygyanvihar.com'],
    ['proc', 'procurement@mygyanvihar.com'],
    ['prochead', 'prochead@mygyanvihar.com'],
    ['finctrl', 'fincontroller@mygyanvihar.com'],
    ['stores', 'stores@mygyanvihar.com'],
    ['finance', 'finance@mygyanvihar.com'],
    ['coo', 'coo@mygyanvihar.com'],
    ['dean', 'dean.dofa@mygyanvihar.com'],
  ];
  for (const [key, email] of personas) {
    try {
      tokens[key] = await login(email);
      ok(`login:${key}`);
    } catch (e) {
      fail(`login:${key}`, e.message);
    }
  }
  if (!tokens.lab || !tokens.proc) {
    console.log('\nCannot continue without LabAdmin + Procurement.');
    process.exit(1);
  }

  // DOFA levels matrix
  try {
    const levels = await req('GET', '/api/operations/p2p/dofa/levels', tokens.coo || tokens.lab);
    if (!levels.ok || !Array.isArray(levels.data) || levels.data.length < 5) {
      throw new Error(`${levels.status} ${JSON.stringify(levels.data)}`);
    }
    const l3 = levels.data.find((l) => l.level_no === 3);
    if (!l3 || Number(l3.required_signatures) !== 2) throw new Error('L3 must need 2 signatures');
    if (Number(l3.max_amount_inr) !== 500000) throw new Error(`L3 max=${l3.max_amount_inr}`);
    ok('GET dofa/levels', `L3 dual-sign ≤5L`);
  } catch (e) {
    fail('GET dofa/levels', e.message);
  }

  // Requestor creates PR — LabAdmin cannot add quotes
  let prId;
  try {
    const pr = await req('POST', '/api/operations/p2p/requisitions', tokens.lab, {
      description: `Oscilloscope DOFA v2 ${Date.now()}`,
      amount_estimate: 400000,
      technical_specs: '1 GHz, 4-channel',
    });
    if (!pr.ok || pr.data.status !== 'SUBMITTED') {
      throw new Error(`${pr.status} ${JSON.stringify(pr.data)}`);
    }
    prId = pr.data.pr_id;
    if (pr.data.expected_dofa_level?.level_no !== 3) {
      throw new Error(`expected L3 got ${pr.data.expected_dofa_level?.level_no}`);
    }
    ok('POST requisition SUBMITTED', `L3 expected pr=${prId.slice(0, 8)}`);
  } catch (e) {
    fail('POST requisition SUBMITTED', e.message);
  }

  try {
    const blocked = await req('POST', `/api/operations/p2p/requisitions/${prId}/quotes`, tokens.lab, {
      vendor_name: 'X',
      gstin: '27AABCU9603R1ZM',
      amount_inr: 400000,
      pdf_path: '/uploads/x.pdf',
    });
    if (blocked.ok) throw new Error('LabAdmin must not add quotes');
    ok('Requestor quote blocked', String(blocked.status));
  } catch (e) {
    fail('Requestor quote blocked', e.message);
  }

  // Procurement claim + 3 quotes
  try {
    const claim = await req('POST', `/api/operations/p2p/requisitions/${prId}/claim`, tokens.proc);
    const claimRow = Array.isArray(claim.data) ? claim.data[0] : claim.data;
    if (!claim.ok || claimRow?.status !== 'SOURCING') {
      throw new Error(`${claim.status} ${JSON.stringify(claim.data)}`);
    }
    ok('POST claim → SOURCING');
  } catch (e) {
    fail('POST claim → SOURCING', e.message);
  }

  const quotes = [
    { vendor_name: 'Scope A', gstin: '27AABCU9603R1ZM', amount_inr: 400000 },
    { vendor_name: 'Scope B', gstin: '29AABCT1332L1ZV', amount_inr: 420000 },
    { vendor_name: 'Scope C', gstin: '07AAACS4429R1ZR', amount_inr: 450000 },
  ];
  let lowestId;
  for (const q of quotes) {
    try {
      const r = await req('POST', `/api/operations/p2p/requisitions/${prId}/quotes`, tokens.proc, {
        ...q,
        pdf_path: `/uploads/${q.gstin}.pdf`,
      });
      if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
      if (q.amount_inr === 400000) lowestId = r.data.quote_id;
      ok(`quote ${q.vendor_name}`, `₹${q.amount_inr}`);
    } catch (e) {
      fail(`quote ${q.vendor_name}`, e.message);
    }
  }

  // Submit for DOFA → PENDING_L3
  try {
    const detail = await req('GET', `/api/operations/p2p/requisitions/${prId}`, tokens.proc);
    lowestId = (detail.data.quotes || []).find((q) => q.is_system_l1)?.quote_id || lowestId;
    const sub = await req(
      'POST',
      `/api/operations/p2p/requisitions/${prId}/submit-for-approval`,
      tokens.proc,
      { selected_quote_id: lowestId },
    );
    if (!sub.ok || sub.data.status !== 'PENDING_L3' || sub.data.required_level !== 3) {
      throw new Error(`${sub.status} ${JSON.stringify(sub.data)}`);
    }
    ok('submit-for-approval → PENDING_L3');
  } catch (e) {
    fail('submit-for-approval → PENDING_L3', e.message);
  }

  // Single L3 signature insufficient
  let poId = null;
  if (tokens.prochead && tokens.finctrl) {
    try {
      const one = await req(
        'POST',
        `/api/operations/p2p/requisitions/${prId}/approve`,
        tokens.prochead,
        { decision: 'APPROVED' },
      );
      if (!one.ok) throw new Error(`${one.status} ${JSON.stringify(one.data)}`);
      if (one.data.po) throw new Error('single L3 signature must not create PO');
      ok('L3 first signature (ProcurementHead)', `awaiting=${(one.data.awaiting || []).join(',')}`);
    } catch (e) {
      fail('L3 first signature (ProcurementHead)', e.message);
    }

    try {
      const two = await req(
        'POST',
        `/api/operations/p2p/requisitions/${prId}/approve`,
        tokens.finctrl,
        { decision: 'APPROVED' },
      );
      if (!two.ok || !two.data.po?.po_id) {
        throw new Error(`${two.status} ${JSON.stringify(two.data)}`);
      }
      poId = two.data.po.po_id;
      ok('L3 second signature → PO', `po=${poId.slice(0, 8)}`);
    } catch (e) {
      fail('L3 second signature → PO', e.message);
    }
  } else {
    fail('L3 dual sign', 'missing prochead/finctrl tokens');
  }

  // COO cannot GRN; Stores can with barcode
  if (poId && tokens.stores) {
    try {
      if (tokens.coo) {
        const cooGrn = await req('POST', '/api/operations/p2p/grn', tokens.coo, {
          po_id: poId,
          photo_path: '/u/a.jpg',
          challan_path: '/u/b.pdf',
          asset_barcode: 'SGVU-TEST-001',
        });
        if (cooGrn.ok) throw new Error('COO must not GRN');
        ok('COO GRN blocked', String(cooGrn.status));
      }
    } catch (e) {
      fail('COO GRN blocked', e.message);
    }

    try {
      const noBar = await req('POST', '/api/operations/p2p/grn', tokens.stores, {
        po_id: poId,
        photo_path: '/u/a.jpg',
        challan_path: '/u/b.pdf',
      });
      if (noBar.ok) throw new Error('barcode required');
      ok('GRN barcode required', String(noBar.data?.code || noBar.status));
    } catch (e) {
      fail('GRN barcode required', e.message);
    }

    try {
      const grn = await req('POST', '/api/operations/p2p/grn', tokens.stores, {
        po_id: poId,
        photo_path: '/u/a.jpg',
        challan_path: '/u/b.pdf',
        asset_barcode: 'SGVU-OSC-400K',
      });
      if (!grn.ok) throw new Error(`${grn.status} ${JSON.stringify(grn.data)}`);
      ok('Stores GRN with barcode', grn.data.asset_barcode);
    } catch (e) {
      fail('Stores GRN with barcode', e.message);
    }
  }

  // COO cannot pay; Finance can attempt (may fail without invoice — that's OK)
  if (poId) {
    try {
      if (tokens.coo) {
        const pay = await req('POST', `/api/operations/p2p/purchase-orders/${poId}/pay`, tokens.coo);
        if (pay.ok) throw new Error('COO must not pay');
        ok('COO pay blocked', String(pay.status));
      }
    } catch (e) {
      fail('COO pay blocked', e.message);
    }

    if (tokens.finance) {
      try {
        const pay = await req(
          'POST',
          `/api/operations/p2p/purchase-orders/${poId}/pay`,
          tokens.finance,
        );
        // Expect 400 THREE_WAY without invoice — role allowed
        if (pay.status === 403) throw new Error('Finance should be allowed to attempt pay');
        ok(
          'Finance AP pay attempt',
          pay.ok ? 'paid' : `${pay.status} ${pay.data?.code || pay.data?.message || ''}`.slice(0, 60),
        );
      } catch (e) {
        fail('Finance AP pay attempt', e.message);
      }
    }
  }

  // Related-party still blocked via procurement path
  try {
    const prR = await req('POST', '/api/operations/p2p/requisitions', tokens.lab, {
      description: `Related party ${Date.now()}`,
      amount_estimate: 80000,
    });
    await req('POST', `/api/operations/p2p/requisitions/${prR.data.pr_id}/claim`, tokens.proc);
    for (const q of [
      { vendor_name: 'A', gstin: '27AABCU9603R1ZM', amount_inr: 80000 },
      { vendor_name: 'B', gstin: '09AABCU9603R1ZA', amount_inr: 81000 },
      { vendor_name: 'C', gstin: '19AABCD1234E1Z5', amount_inr: 82000 },
    ]) {
      await req('POST', `/api/operations/p2p/requisitions/${prR.data.pr_id}/quotes`, tokens.proc, {
        ...q,
        pdf_path: `/u/${q.gstin}.pdf`,
      });
    }
    const d = await req('GET', `/api/operations/p2p/requisitions/${prR.data.pr_id}`, tokens.proc);
    const lowest = (d.data.quotes || []).find((q) => q.is_system_l1);
    const sub = await req(
      'POST',
      `/api/operations/p2p/requisitions/${prR.data.pr_id}/submit-for-approval`,
      tokens.proc,
      { selected_quote_id: lowest.quote_id },
    );
    if (sub.ok || sub.data?.code !== 'RELATED_PARTY_QUOTES') {
      throw new Error(`expected RELATED_PARTY_QUOTES got ${JSON.stringify(sub.data)}`);
    }
    ok('related-party blocked', 'RELATED_PARTY_QUOTES');
  } catch (e) {
    fail('related-party blocked', e.message);
  }

  // Catalog still works for requestor (routes to DOFA, no auto-PO for large)
  try {
    const cat = await req('GET', '/api/operations/p2p/catalog', tokens.lab);
    if (!cat.ok || !cat.data?.[0]) throw new Error('no catalog');
    const order = await req('POST', '/api/operations/p2p/catalog/order', tokens.lab, {
      catalog_item_id: cat.data[0].catalog_item_id,
      qty: 1,
    });
    if (!order.ok || !order.data.skips_quotes) throw new Error(JSON.stringify(order.data));
    ok('catalog order skips quotes', `status=${order.data.status || order.data.pr?.status}`);
  } catch (e) {
    fail('catalog order skips quotes', e.message);
  }

  // --- Three-pillar org hierarchy ---
  console.log('\n--- Three-pillar org ---');
  for (const [key, email] of [
    ['cfo', 'cfo@mygyanvihar.com'],
    ['apmgr', 'apmanager@mygyanvihar.com'],
    ['auditor', 'auditor@mygyanvihar.com'],
    ['hr', 'hr@mygyanvihar.com'],
    ['chairman', 'chairman@mygyanvihar.com'],
  ]) {
    try {
      tokens[key] = await login(email);
      ok(`login:${key}`);
    } catch (e) {
      fail(`login:${key}`, e.message);
    }
  }

  try {
    const org = await req(
      'GET',
      '/api/operations/org/pillars',
      tokens.chairman || tokens.cfo || tokens.coo,
    );
    if (!org.ok || !org.data?.people?.length) {
      throw new Error(`${org.status} ${JSON.stringify(org.data)}`);
    }
    const byEmail = Object.fromEntries(
      org.data.people.map((p) => [String(p.email || '').toLowerCase(), p]),
    );
    const prochead = byEmail['prochead@mygyanvihar.com'];
    const stores = byEmail['stores@mygyanvihar.com'];
    const cfo = byEmail['cfo@mygyanvihar.com'];
    const buyer = byEmail['buyer.it@mygyanvihar.com'];
    const coo = byEmail['coo@mygyanvihar.com'];
    const chairman = byEmail['chairman@mygyanvihar.com'];
    if (!prochead || !stores || !cfo || !buyer || !coo || !chairman) {
      throw new Error('missing seeded pillar personas in org response');
    }
    if (prochead.reporting_officer_id !== coo.user_id) {
      throw new Error('ProcurementHead.RO must be COO');
    }
    if (stores.reporting_officer_id !== coo.user_id) {
      throw new Error('Stores.RO must be COO');
    }
    if (cfo.reporting_officer_id !== chairman.user_id) {
      throw new Error('CFO.RO must be Chairman');
    }
    if (buyer.reporting_officer_id === stores.reporting_officer_id && buyer.role_name === 'Stores') {
      throw new Error('buyer should not share Stores leaf');
    }
    if (buyer.reporting_officer_id === stores.user_id) {
      throw new Error('buyer must not report to Stores');
    }
    if (buyer.reporting_officer_id !== prochead.user_id) {
      throw new Error('buyer.RO must be ProcurementHead');
    }
    ok('reporting graph', 'prochead/stores→COO; cfo→chairman; buyer→prochead');
  } catch (e) {
    fail('reporting graph', e.message);
  }

  // Finance cannot report to COO
  if (tokens.hr && tokens.cfo && tokens.coo) {
    try {
      const org = await req('GET', '/api/operations/org/pillars', tokens.chairman || tokens.coo);
      const cfo = (org.data?.people || []).find(
        (p) => String(p.email || '').toLowerCase() === 'cfo@mygyanvihar.com',
      );
      const coo = (org.data?.people || []).find(
        (p) => String(p.email || '').toLowerCase() === 'coo@mygyanvihar.com',
      );
      const patch = await req('PATCH', `/api/hr/employees/${cfo.user_id}`, tokens.hr, {
        reporting_officer_id: coo.user_id,
      });
      if (patch.ok) throw new Error('Finance→COO must be rejected');
      const code = patch.data?.code || patch.data?.message?.code || '';
      if (patch.status !== 400 && !String(JSON.stringify(patch.data)).includes('FINANCE_REPORTS_TO_COO')) {
        throw new Error(`expected FINANCE_REPORTS_TO_COO got ${patch.status} ${JSON.stringify(patch.data)}`);
      }
      ok('HR rejects Finance→COO', String(code || patch.status));
    } catch (e) {
      fail('HR rejects Finance→COO', e.message);
    }
  } else {
    fail('HR rejects Finance→COO', 'missing hr/cfo/coo tokens');
  }

  // InternalAuditor fraud read; cannot GRN/pay
  if (tokens.auditor) {
    try {
      const fraud = await req('GET', '/api/operations/p2p/analytics/fraud-signals', tokens.auditor);
      if (!fraud.ok) throw new Error(`${fraud.status} ${JSON.stringify(fraud.data)}`);
      ok('InternalAuditor fraud-signals', 'read ok');
    } catch (e) {
      fail('InternalAuditor fraud-signals', e.message);
    }
    try {
      const grn = await req('POST', '/api/operations/p2p/grn', tokens.auditor, {
        po_id: '00000000-0000-4000-8000-000000000099',
        photo_path: '/u/a.jpg',
        challan_path: '/u/b.pdf',
        asset_barcode: 'X',
      });
      if (grn.ok || grn.status !== 403) {
        // 404/400 also fine if role blocked differently; 403 expected from RolesGuard
        if (grn.status !== 403) throw new Error(`expected 403 got ${grn.status}`);
      }
      ok('InternalAuditor GRN blocked', String(grn.status));
    } catch (e) {
      fail('InternalAuditor GRN blocked', e.message);
    }
    try {
      const pay = await req(
        'POST',
        '/api/operations/p2p/purchase-orders/00000000-0000-4000-8000-000000000099/pay',
        tokens.auditor,
      );
      if (pay.status !== 403) throw new Error(`expected 403 got ${pay.status}`);
      ok('InternalAuditor pay blocked', String(pay.status));
    } catch (e) {
      fail('InternalAuditor pay blocked', e.message);
    }
  }

  // Penalty-netted pay (uses pg to attach matching invoice)
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
    const vendor = await client.query(
      `SELECT vendor_id FROM fin_vendors WHERE tenant_id = (SELECT tenant_id FROM tenants WHERE subdomain='sgvu' LIMIT 1) LIMIT 1`,
    );
    if (!vendor.rows[0]) throw new Error('no vendor');
    const vendorId = vendor.rows[0].vendor_id;
    const amount = 100000;
    const poIns = await client.query(
      `INSERT INTO fin_purchase_orders (tenant_id, description, amount, status, vendor_id, requested_by)
       SELECT t.tenant_id, $1, $2, 'APPROVED', $3, u.user_id
       FROM tenants t
       CROSS JOIN users u
       WHERE t.subdomain = 'sgvu' AND lower(u.official_email) = 'labadmin@mygyanvihar.com'
       RETURNING po_id`,
      [`Penalty net test ${Date.now()}`, amount, vendorId],
    );
    const poIdPen = poIns.rows[0].po_id;
    await client.query(
      `INSERT INTO fin_goods_receipts (tenant_id, po_id, received_by, photo_path, challan_path, asset_barcode, received_at_gate)
       SELECT t.tenant_id, $1, u.user_id, '/u/a.jpg', '/u/b.pdf', 'SGVU-PEN-1', true
       FROM tenants t CROSS JOIN users u
       WHERE t.subdomain='sgvu' AND lower(u.official_email)='stores@mygyanvihar.com'`,
      [poIdPen],
    );
    await client.query(
      `INSERT INTO fin_vendor_invoices
         (tenant_id, vendor_id, invoice_number, invoice_date, taxable_amount, gst_amount, tds_amount,
          total_amount, net_payable, status, po_id)
       SELECT t.tenant_id, $1, $2, CURRENT_DATE, $3, 0, 0, $3, $3, 'APPROVED', $4
       FROM tenants t WHERE t.subdomain='sgvu'`,
      [vendorId, `INV-PEN-${Date.now()}`, amount, poIdPen],
    );
    await client.query(
      `INSERT INTO fin_vendor_penalties (tenant_id, vendor_id, reason, amount_inr, auto_applied)
       SELECT t.tenant_id, $1, 'Canteen downtime SLA', 20000, true
       FROM tenants t WHERE t.subdomain='sgvu'`,
      [vendorId],
    );
    await client.end();

    const payToken = tokens.apmgr || tokens.finance || tokens.cfo;
    if (!payToken) throw new Error('no AP token');
    const pay = await req('POST', `/api/operations/p2p/purchase-orders/${poIdPen}/pay`, payToken);
    if (!pay.ok) throw new Error(`${pay.status} ${JSON.stringify(pay.data)}`);
    if (Number(pay.data.gross) !== amount) throw new Error(`gross=${pay.data.gross}`);
    if (Number(pay.data.penalties) !== 20000) throw new Error(`penalties=${pay.data.penalties}`);
    if (Number(pay.data.net_paid) !== 80000) throw new Error(`net=${pay.data.net_paid}`);
    ok('pay nets vendor penalty', `gross ${amount} − 20k = ${pay.data.net_paid}`);
  } catch (e) {
    fail('pay nets vendor penalty', e.message);
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
