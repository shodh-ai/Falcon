'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  verifyBrowser,
  localOrigin,
  sanitize,
  browserRoutes,
  loadPlaywright,
  browserExecutable,
  evidenceIssues,
  normalizeText,
  errorRoute,
  waitForFixtureEvidence,
} = require('./browser.cjs');

const courses = [
  ['C201', 'Smoke Test Programming Fundamentals', 4],
  ['C202', 'Smoke Test Data and Databases', 4],
  ['C203', 'Smoke Test Responsible AI', 3],
].map(([code, name, credits]) => ({
  course_id: `test-${code}`, course_code: `SMK-PORTAL-${code}`, course_name: name, credits,
}));

test('browser network safety allows loopback only and removes paths from origin', () => {
  assert.equal(
    localOrigin('http://falcon-student-smoke.localhost:3100/student/dashboard'),
    'http://falcon-student-smoke.localhost:3100',
  );
  assert.equal(localOrigin('http://127.0.0.1:4100'), 'http://127.0.0.1:4100');
  assert.equal(localOrigin('http://[::1]:4100'), 'http://[::1]:4100');
  for (const url of [
    'https://falcon.example.com',
    'http://localhost.evil.example:4100',
    'http://student:secret@localhost:3100',
    'file:///test.html',
    'not a URL',
  ]) {
    assert.equal(localOrigin(url), null);
  }
});

test('credential sanitization removes actor credentials and observed JWTs', () => {
  const actors = {
    student: {
      email: 'synthetic@smoke.invalid',
      password: 'Password-MUST-NOT-LEAK',
      token: 'opaque-secret-token',
    },
  };
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdHVkZW50In0.abcdef12345';
  const message = `fill("${actors.student.password}") ${actors.student.email} Authorization: Bearer ${actors.student.token} ${jwt} /api?access_token=another-opaque&password=unknown-password`;
  const clean = sanitize(message, actors);
  for (const secret of [
    actors.student.password,
    actors.student.email,
    actors.student.token,
    jwt,
    'another-opaque',
    'unknown-password',
  ])
    assert.ok(!clean.includes(secret));
  assert.ok(clean.includes('[REDACTED'));
  assert.ok(sanitize('x'.repeat(5000)).length <= 1200);
});

test('browser route inventory includes real assignments without payment/attempt actions', () => {
  const routes = browserRoutes({
    courses: [
      {
        course_id: 'test course',
        course_code: 'SMK101',
        course_name: '[SMOKE v1] Computing',
      },
    ],
  });
  assert.ok(
    routes.some(
      (route) =>
        route.path === '/student/courses/test%20course?tab=assignments',
    ),
  );
  for (const required of [
    '/student/dashboard',
    '/student/profile',
    '/student/courses',
    '/student/timetable',
    '/student/attendance',
    '/student/exams',
    '/student/marks',
    '/student/finance',
    '/notifications',
    '/student/academic-calendar',
    '/student/admission-vault',
    '/student/policies',
  ])
    assert.ok(routes.some((route) => route.path === required));
  assert.ok(
    !routes.some((route) =>
      /checkout|\/pay|\/submit|\/attempt\//.test(route.path),
    ),
  );
});

test('every covered route requires fixture evidence, not just a heading', () => {
  const routes = browserRoutes({ courses });
  for (const route of routes) {
    assert.ok(route.evidence, `${route.name} has fixture assertions`);
    assert.ok(evidenceIssues(route.evidence, { content: route.heading ?? 'Student Portal' }).length > 0,
      `${route.name} must reject a heading-only/empty page`);
  }
  assert.ok(evidenceIssues({}, { content: 'Student Portal Smoke Test' }).length > 0);
  assert.equal(normalizeText('  Marks\n scored:  16/20 '), 'Marks scored: 16/20');
});

test('materials and announcements cannot pass because their course heading contains Smoke Test', () => {
  const routes = browserRoutes({ courses });
  for (const kind of ['Course materials', 'Course announcements']) {
    const route = routes.find((item) => item.name === `${kind} SMK-PORTAL-C201`);
    const record = route.evidence.records[0];
    assert.ok(evidenceIssues(route.evidence, { content: route.heading, records: { [record.key]: [route.heading] } }).length);
    assert.deepEqual(evidenceIssues(route.evidence, {
      content: route.heading,
      records: { [record.key]: [`${record.anchor} ${record.contains.join(' ')}`] },
    }), []);
  }
});

test('assignment evidence requires the proper pending/submitted/graded case and score', () => {
  const routes = browserRoutes({ courses });
  for (const code of ['C201', 'C202', 'C203']) {
    const route = routes.find((item) => item.name === `Assignments SMK-PORTAL-${code}`);
    const record = route.evidence.records[0];
    assert.ok(evidenceIssues(route.evidence, { records: { [record.key]: [record.anchor] } }).length);
    assert.deepEqual(evidenceIssues(route.evidence, {
      records: { [record.key]: [`${record.anchor} ${record.contains.join(' ')}${code === 'C203' ? ' 16.00/20' : ''}`] },
    }), []);
  }
});

test('delayed Calendar hydration error is never attributed to Admission Documents', () => {
  assert.equal(errorRoute('Nested button error in StudentAcademicCalendarWorkspace', 'Admission Documents'), 'Academic Calendar');
  assert.equal(errorRoute('http://localhost:3100/student/academic-calendar', 'Admission Documents'), 'Academic Calendar');
  assert.equal(errorRoute('Failed to load uploaded documents', 'Admission Documents'), 'Admission Documents');
});

test('fixture readiness waits for asynchronous DOM evidence, not network-idle or a heading', async () => {
  let reads = 0;
  const result = await waitForFixtureEvidence(async () => {
    reads += 1;
    return { content: reads < 3 ? 'My Profile Loading profile…' : 'ENR-2026-SYNTHETIC' };
  }, { texts: ['ENR-2026-SYNTHETIC'] }, 1000, 1);
  assert.equal(reads, 3);
  assert.equal(result.content, 'ENR-2026-SYNTHETIC');
  await assert.rejects(waitForFixtureEvidence(async () => ({ content: 'My Profile' }),
    { texts: ['ENR-2026-SYNTHETIC'] }, 5, 1), /did not render/);
});

test('status and attendance percentage must occur in the same actual record', () => {
  const route = browserRoutes({ courses }).find((item) => item.name === 'Attendance');
  const record = route.evidence.records[0];
  const spec = { records: [record] };
  const wrongRows = [record.anchor, `${record.contains[0]} ${record.contains[1]}`];
  assert.ok(evidenceIssues(spec, { records: { [record.key]: wrongRows } }).length);
  assert.deepEqual(evidenceIssues(spec, { records: { [record.key]: [`${record.anchor} ${record.contains.join(' ')}`] } }), []);
});

test('finance must show reconciled totals and both real payment rows', () => {
  const spec = browserRoutes({ courses }).find((item) => item.name === 'Finance').evidence;
  const observed = {
    metrics: Object.fromEntries(spec.metrics.map((item) => [item.key, [`${item.label}\n${item.value}`]])),
    records: Object.fromEntries(spec.records.map((item) => [item.key, [`${item.anchor} ${item.contains.join(' ')}`]])),
  };
  assert.deepEqual(evidenceIssues(spec, observed), []);
  observed.metrics['outstanding amount'] = ['Pending Amount ₹61,500.00'];
  assert.match(evidenceIssues(spec, observed).join(' '), /46,500/);
  observed.metrics['outstanding amount'] = ['Pending Amount ₹46,500.00'];
  observed.records['full real payment'] = [];
  assert.match(evidenceIssues(spec, observed).join(' '), /full real payment/);
});

test('published historical marks accept database decimal strings but not wrong scores', () => {
  const spec = browserRoutes({ courses }).find((item) => item.name === 'Marks / Results').evidence;
  const observed = { metrics: { 'overall CGPA': ['Overall CGPA 7.50'] }, records: {
    'historical computing score': ['SMK-PORTAL-H101 Passed 82.00/100.00 Grade A'],
    'historical quantitative score': ['SMK-PORTAL-H102 Passed 52/100 Grade C'],
  } };
  assert.deepEqual(evidenceIssues(spec, observed), []);
  observed.records['historical computing score'] = ['SMK-PORTAL-H101 Passed 52/100 Grade A'];
  assert.match(evidenceIssues(spec, observed).join(' '), /historical computing/);
  const internals = browserRoutes({ courses }).find((item) => item.name === 'Published internal marks').evidence;
  assert.deepEqual(evidenceIssues(internals, { records: {
    'published C201 internal total': ['SMK-PORTAL-C201 Internal total: 8/10'],
  } }), []);
});

test('exam records require at least three scheduled rows with real timing and venue', () => {
  const spec = browserRoutes({ courses }).find((item) => item.name === 'Examinations').evidence;
  const row = '09:00 – 11:00 MID TERM Smoke Academic Block SMOKE — 201';
  assert.ok(evidenceIssues(spec, { records: { 'three scheduled examinations': [row, row] } }).length);
  assert.deepEqual(evidenceIssues(spec, { records: { 'three scheduled examinations': [row, row, row] } }), []);
});

test('uploaded certificates use real Admission Vault, not degree redirect routes', () => {
  const route = browserRoutes({ courses }).find((item) => item.name === 'Uploaded Certificate Portfolio');
  assert.equal(route.path, '/student/admission-vault');
  assert.deepEqual(route.evidence.records.map((record) => record.contains[0]), ['VERIFIED', 'REJECTED', 'PENDING']);
  const records = Object.fromEntries(route.evidence.records.map((record) => [record.key, [`${record.anchor} ${record.contains[0]}`]]));
  assert.deepEqual(evidenceIssues(route.evidence, { records }), []);
  records['certificate VERIFIED'] = ['[SMOKE v1] Synthetic Python workshop certificate PENDING'];
  assert.ok(evidenceIssues(route.evidence, { records }).length);
});

test('policy evidence requires published fixture PDFs and no mutating browser action', () => {
  const routes = browserRoutes({ courses });
  const policy = routes.find((route) => route.name === 'Policies');
  assert.ok(evidenceIssues(policy.evidence, { content: 'Attendance Policy Library Rules Fee Policy' }).length);
  const observed = { content: policy.evidence.texts.join(' '), records: Object.fromEntries(
    policy.evidence.records.map((record) => [record.key, [`${record.anchor} ${record.contains.join(' ').toUpperCase()}`]]),
  ) };
  assert.deepEqual(evidenceIssues(policy.evidence, observed), []);
  assert.deepEqual([...new Set(routes.map((route) => route.actions).filter(Boolean))], ['semester-one', 'semester-two-internals']);
});

test('unconfigured frontend reports BLOCKED, not a passed browser test', async () => {
  const blocked = [];
  const ctx = {
    config: {},
    blocked: (...args) => blocked.push(args),
    check: () => {
      throw new Error('No UI test was executed');
    },
  };
  const result = await verifyBrowser(ctx);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.routes.length, 0);
  assert.equal(blocked.length, 1);
});

test('remote frontend/backend and missing credentials fail before launching a browser', async () => {
  await assert.rejects(
    verifyBrowser({ config: { web: 'https://falcon.example.com' } }),
    /local frontend/,
  );
  await assert.rejects(
    verifyBrowser({
      config: {
        web: 'http://localhost:3100',
        api: 'https://falcon.example.com',
      },
    }),
    /remote backend/,
  );
  await assert.rejects(
    verifyBrowser({
      config: { web: 'http://localhost:3100' },
      actors: {},
      ids: {},
    }),
    /in-memory password/,
  );
});

test('dependency inspection never launches or downloads browsers', () => {
  const playwright = loadPlaywright();
  if (!playwright) return;
  assert.equal(typeof playwright.chromium.launch, 'function');
  const executable = browserExecutable(playwright);
  if (executable) assert.ok(require('node:fs').existsSync(executable));
});
