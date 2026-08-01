/**
 * Blueprint API smoke tests — login as seeded personas and exercise core routes.
 * Usage: node scripts/blueprint-api-smoke.js
 * Requires backend on PORT (default 4000) + migrations applied.
 */
const BASE = process.env.API_BASE || 'http://localhost:4000';
const TENANT = { 'x-tenant-subdomain': 'sgvu', 'Content-Type': 'application/json' };

const personas = [
  { email: 'coo@mygyanvihar.com', password: 'password123', label: 'COO' },
  { email: 'labadmin@mygyanvihar.com', password: 'password123', label: 'LabAdmin' },
  { email: 'challenges@mygyanvihar.com', password: 'password123', label: 'CompetitionAdmin' },
  { email: 'fellowship@mygyanvihar.com', password: 'password123', label: 'FellowshipAdmin' },
  { email: 'wrangler@mygyanvihar.com', password: 'password123', label: 'Wrangler' },
];

async function req(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...TENANT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

async function login(email, password) {
  const res = await req('POST', '/api/auth/local-login', null, { email, password });
  if (!res.ok || !res.data?.token) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data.token;
}

const results = [];
function pass(name) {
  results.push({ name, ok: true });
  console.log(`  PASS  ${name}`);
}
function fail(name, err) {
  results.push({ name, ok: false, err: String(err) });
  console.log(`  FAIL  ${name}: ${err}`);
}

async function main() {
  console.log(`Blueprint smoke → ${BASE}`);

  // Health
  try {
    const h = await fetch(`${BASE}/api/health`).catch(() => null);
    if (!h || !h.ok) {
      // some apps use /health
      const h2 = await fetch(`${BASE}/health`).catch(() => null);
      if (!h2 || !h2.ok) {
        console.log('WARN: health endpoint not found — continuing if API responds to login');
      } else pass('health');
    } else pass('health');
  } catch (e) {
    fail('health', e.message);
  }

  let cooToken;
  let labToken;
  let compToken;
  let fellowshipToken;

  for (const p of personas) {
    try {
      const token = await login(p.email, p.password);
      pass(`login:${p.label}`);
      if (p.label === 'COO') cooToken = token;
      if (p.label === 'LabAdmin') labToken = token;
      if (p.label === 'CompetitionAdmin') compToken = token;
      if (p.label === 'FellowshipAdmin') fellowshipToken = token;
    } catch (e) {
      fail(`login:${p.label}`, e.message);
    }
  }

  if (labToken) {
    try {
      const z = await req('GET', '/api/labs/zones', labToken);
      if (!z.ok) throw new Error(`${z.status} ${JSON.stringify(z.data)}`);
      if (!Array.isArray(z.data) || z.data.length < 4) {
        throw new Error(`expected >=4 zones, got ${z.data?.length}`);
      }
      pass(`labs:zones(${z.data.length})`);
    } catch (e) {
      fail('labs:zones', e.message);
    }
    try {
      const e = await req('GET', '/api/labs/equipment', labToken);
      if (!e.ok) throw new Error(`${e.status}`);
      pass(`labs:equipment(${Array.isArray(e.data) ? e.data.length : 0})`);
    } catch (err) {
      fail('labs:equipment', err.message);
    }
    try {
      const b = await req('GET', '/api/labs/budget', labToken);
      if (!b.ok) throw new Error(`${b.status}`);
      pass(`labs:budget(${b.data?.program_name ?? 'ok'})`);
    } catch (err) {
      fail('labs:budget', err.message);
    }
  }

  if (compToken) {
    try {
      const c = await req('GET', '/api/competitions', compToken);
      if (!c.ok) throw new Error(`${c.status}`);
      if (!Array.isArray(c.data) || c.data.length < 3) {
        throw new Error(`expected >=3 competitions, got ${c.data?.length}`);
      }
      pass(`competitions:list(${c.data.length})`);

      const submit = await req('POST', '/api/competitions/entries', compToken, {
        competition_id: c.data[0].competition_id,
        applicant_name: 'Smoke Tester',
        applicant_email: 'smoke@test.local',
        whitepaper_url: 'https://example.com/wp.pdf',
      });
      if (!submit.ok) throw new Error(`submit ${submit.status} ${JSON.stringify(submit.data)}`);
      pass('competitions:submit');

      const gt = await req(
        'POST',
        `/api/competitions/entries/${submit.data.entry_id}/golden-ticket`,
        compToken,
      );
      if (!gt.ok) throw new Error(`golden ${gt.status} ${JSON.stringify(gt.data)}`);
      if (!gt.data?.golden_ticket_code) throw new Error('missing golden_ticket_code');
      pass(`competitions:golden(${gt.data.golden_ticket_code})`);
    } catch (e) {
      fail('competitions:flow', e.message);
    }
  }

  if (cooToken) {
    try {
      const d = await req('GET', '/api/operations/dashboard', cooToken);
      if (!d.ok) throw new Error(`${d.status} ${JSON.stringify(d.data)}`);
      pass('ops:dashboard');
    } catch (e) {
      fail('ops:dashboard', e.message);
    }
    try {
      const locs = await req('GET', '/api/operations/esm/locations', cooToken);
      if (!locs.ok) throw new Error(`${locs.status}`);
      const qr = locs.data?.[0]?.qr_code;
      if (!qr) throw new Error('no QR locations seeded');
      const ticket = await req('POST', '/api/operations/esm/from-qr', cooToken, {
        qr_code: qr,
        subject: 'Smoke QR ticket',
      });
      if (!ticket.ok) throw new Error(`from-qr ${ticket.status} ${JSON.stringify(ticket.data)}`);
      pass(`ops:qr-ticket(${ticket.data.ticket_ref ?? ticket.data.ticket_id})`);
    } catch (e) {
      fail('ops:qr-ticket', e.message);
    }
    try {
      const dofa = await req('GET', '/api/operations/p2p/dofa/levels', cooToken);
      if (!dofa.ok) throw new Error(`${dofa.status}`);
      pass(`ops:dofa-levels(${Array.isArray(dofa.data) ? dofa.data.length : 0})`);

      const catalog = await req('GET', '/api/operations/p2p/catalog', cooToken);
      if (!catalog.ok) throw new Error(`catalog ${catalog.status}`);
      pass(`ops:catalog(${Array.isArray(catalog.data) ? catalog.data.length : 0})`);

      const fraud = await req('GET', '/api/operations/p2p/analytics/fraud-signals', cooToken);
      if (!fraud.ok) throw new Error(`fraud ${fraud.status}`);
      pass('ops:fraud-signals');

      // Requestor path uses LabAdmin (COO is oversight, not maker)
      if (labToken) {
        const pr = await req('POST', '/api/operations/p2p/requisitions', labToken, {
          description: 'Smoke PR four-dept',
          amount_estimate: 40000,
        });
        if (!pr.ok || !pr.data?.pr_id) throw new Error(`pr ${pr.status}`);
        if (pr.data.status !== 'SUBMITTED') throw new Error(`expected SUBMITTED got ${pr.data.status}`);
        pass('ops:create-pr-submitted');
      }

      // Direct PO is Procurement-only — COO should be forbidden
      const poDenied = await req('POST', '/api/operations/p2p/purchase-orders', cooToken, {
        description: 'Smoke PO denied for COO',
        amount: 12000,
      });
      if (poDenied.ok) throw new Error('COO must not create PO directly');
      pass(`ops:po-create-coo-blocked(${poDenied.status})`);

      // Pay also Finance-only
      const pay = await req(
        'POST',
        `/api/operations/p2p/purchase-orders/00000000-0000-4000-8000-000000000099/pay`,
        cooToken,
      );
      if (pay.ok) throw new Error('COO pay should be forbidden');
      pass(`ops:pay-coo-blocked(${pay.status})`);
    } catch (e) {
      fail('ops:p2p', e.message);
    }
  }

  if (fellowshipToken) {
    try {
      const f = await req('GET', '/api/ecell/fellowships', fellowshipToken);
      if (!f.ok) throw new Error(`${f.status} ${JSON.stringify(f.data)}`);
      pass(`ecell:fellowships(${Array.isArray(f.data) ? f.data.length : 0})`);
      const ip = await req('GET', '/api/ecell/ip-agreements', fellowshipToken);
      if (!ip.ok) throw new Error(`${ip.status}`);
      pass('ecell:ip-agreements');
    } catch (e) {
      fail('ecell:urop', e.message);
    }
  }

  // Moonshots + special programs via COO token (has ops + program visibility)
  if (cooToken) {
    try {
      const m = await req('GET', '/api/moonshots/programs', cooToken);
      if (!m.ok) throw new Error(`${m.status}`);
      if (!Array.isArray(m.data) || m.data.length < 5) {
        throw new Error(`expected 5 moonshots, got ${m.data?.length}`);
      }
      pass(`moonshots:programs(${m.data.length})`);
    } catch (e) {
      fail('moonshots:programs', e.message);
    }
    try {
      const s = await req('GET', '/api/special-programs', cooToken);
      if (!s.ok) throw new Error(`${s.status} ${JSON.stringify(s.data)}`);
      pass(`special-programs(${s.data?.length ?? 0})`);
    } catch (e) {
      fail('special-programs', e.message);
    }
  } else if (labToken) {
    try {
      const m = await req('GET', '/api/moonshots/programs', labToken);
      if (!m.ok) throw new Error(`${m.status}`);
      pass(`moonshots:programs(${m.data?.length ?? 0})`);
    } catch (e) {
      fail('moonshots:programs', e.message);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n========== SUMMARY ==========');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(` - ${r.name}: ${r.err}`);
    }
    process.exit(1);
  }
  console.log('All blueprint smoke checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
