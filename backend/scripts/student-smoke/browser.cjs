'use strict';

// Actual-browser verification. No fake auth, API responses, storage injection,
// payment actions, assignment submissions, traces, or credential screenshots.
const fs = require('node:fs');
const path = require('node:path');

const BUNDLED_PLAYWRIGHT =
  'C:/Users/aksha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';

function localOrigin(value) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (
      parsed.username ||
      parsed.password ||
      !['http:', 'https:'].includes(parsed.protocol)
    )
      return null;
    if (
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      hostname !== '[::1]' &&
      !hostname.endsWith('.localhost')
    )
      return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function sanitize(value, actors = {}, maxLength = 1200) {
  let text = String(value ?? '');
  for (const actor of Object.values(actors)) {
    for (const key of [
      'password',
      'token',
      'access_token',
      'refresh_token',
      'email',
    ]) {
      if (actor?.[key])
        text = text.split(String(actor[key])).join('[REDACTED]');
    }
  }
  return text
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      '[REDACTED JWT]',
    )
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(
      /([?&](?:token|access_token|refresh_token|password|signature|key)=)[^\s&#"']*/gi,
      '$1[REDACTED]',
    )
    .replace(
      /(["']?(?:password|token|access_token|refresh_token)["']?\s*[:=]\s*)["']?[^\s,"'}]+["']?/gi,
      '$1[REDACTED]',
    )
    .slice(0, Math.min(Math.max(maxLength, 0), 50000));
}

function urlPath(value) {
  try {
    return new URL(value).pathname;
  } catch {
    return '[invalid URL]';
  }
}

function loadPlaywright() {
  for (const location of [
    'playwright',
    '@playwright/test',
    BUNDLED_PLAYWRIGHT,
  ]) {
    try {
      const module = require(location);
      if (module.chromium) return module;
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  return null;
}

function browserExecutable(playwright, configured) {
  const candidates = [
    configured,
    playwright?.chromium?.executablePath(),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  return (
    candidates.find(
      (candidate) =>
        candidate && path.isAbsolute(candidate) && fs.existsSync(candidate),
    ) ?? null
  );
}

const FIXTURE_PREFIX = '[SMOKE v1]';

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function errorRoute(message, fallback) {
  // React can report hydration diagnostics after navigation starts. Attribute
  // the actual component stack, never charge the next page for that late error.
  if (/StudentAcademicCalendar(?:Page|Workspace)|\/student\/academic-calendar/.test(String(message)))
    return 'Academic Calendar';
  return fallback;
}

// This validates collected, visible DOM evidence. Headings and shell branding do
// not qualify as records, and each expected status/value must share its own row.
function evidenceIssues(spec, observed) {
  const issues = [];
  if (!(spec.texts?.length || spec.records?.length || spec.metrics?.length))
    issues.push('No fixture evidence defined; headings cannot prove seeded data.');
  const content = normalizeText(observed.content);
  for (const text of spec.texts ?? []) {
    if (!content.includes(normalizeText(text))) issues.push(`Missing visible fixture text: ${text}`);
  }
  for (const record of spec.records ?? []) {
    const rows = (observed.records?.[record.key] ?? []).map(normalizeText);
    const matches = rows.filter((text) => text.toLowerCase().includes(normalizeText(record.anchor).toLowerCase()) &&
      (record.contains ?? []).every((part) => text.toLowerCase().includes(normalizeText(part).toLowerCase())) &&
      (record.patterns ?? []).every((pattern) => new RegExp(pattern).test(text)));
    if (matches.length < (record.minCount ?? 1))
      issues.push(`Missing fixture record/value: ${record.key} (expected ${record.minCount ?? 1}, observed ${matches.length})`);
  }
  for (const metric of spec.metrics ?? []) {
    if (!(observed.metrics?.[metric.key] ?? []).some((text) =>
      metric.pattern ? new RegExp(metric.pattern).test(normalizeText(text)) : normalizeText(text).includes(normalizeText(metric.value))))
      issues.push(`Incorrect visible ${metric.label}: expected ${metric.value}`);
  }
  return issues;
}

async function collectEvidence(main, spec) {
  return main.evaluate((root, expected) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      return element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const records = {};
    for (const record of expected.records ?? []) {
      records[record.key] = [...root.querySelectorAll(record.selector)]
        .filter(visible).map((element) => element.innerText);
    }
    const metrics = {};
    for (const metric of expected.metrics ?? []) {
      metrics[metric.key] = [...root.querySelectorAll('p, span')]
        .filter((element) => visible(element) && normalize(element.textContent) === metric.label)
        .map((element) => element.parentElement?.innerText ?? '');
    }
    const values = [...root.querySelectorAll('input, textarea, select')]
      .filter((element) => visible(element) && !['password', 'hidden'].includes(element.type))
      .map((element) => element.value);
    return { content: `${root.innerText}\n${values.join('\n')}`, records, metrics };
  }, spec);
}

async function waitForFixtureEvidence(read, spec, timeout = 60000, interval = 150) {
  const deadline = Date.now() + timeout;
  let issues = ['Expected fixture evidence has not rendered'];
  do {
    try {
      const observed = await read();
      issues = evidenceIssues(spec, observed);
      if (!issues.length) return observed;
    } catch (error) {
      // Development Fast Refresh may replace a DOM node while hydration runs.
      issues = [`DOM read during navigation/hydration: ${error.message}`];
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(interval, deadline - Date.now())));
  } while (Date.now() <= deadline);
  throw new Error(`Actual fixture evidence did not render within ${timeout}ms: ${issues.join('; ')}`);
}

function browserRoutes(ids, ctx = {}) {
  const courses = ids.courses ?? [];
  const courseNames = courses.map((course) => course.course_name);
  const courseCodes = courses.map((course) => course.course_code);
  const certificateRecords = [
    ['Synthetic Python workshop', 'VERIFIED'],
    ['Fictional unreadable evidence', 'REJECTED'],
    ['Synthetic volunteer activity', 'PENDING'],
  ].map(([title, status]) => ({ key: `certificate ${status}`, selector: 'li',
    anchor: `${FIXTURE_PREFIX} ${title} certificate`, contains: [status] }));
  const routes = [
    {
      name: 'Dashboard',
      path: '/student/dashboard',
      panels: ['Attendance', 'Degree Progress', 'Pending Assignments'],
      evidence: { texts: ['SMOKE TEST — Programming Exercise'], metrics: [
        { key: 'dashboard credits', label: 'Credits completed', value: '8 / 160', pattern: '\\b8\\s*/\\s*160\\b' },
      ] },
    },
    {
      name: 'Profile',
      path: '/student/profile',
      heading: 'My Profile',
      evidence: { texts: [ctx.actors?.student?.name ?? '[SMOKE v1] Nova Testlearner',
        ctx.report?.student?.enrollment, '9999990002', '990000000001',
        'Fictional Test Guardian One', 'Fictional Test Guardian Two', 'FALCON SMOKE PROGRAM'].filter(Boolean) },
    },
    {
      name: 'My Courses',
      path: '/student/courses',
      heading: 'Course Page & DA',
      evidence: { texts: courseNames, records: courses.map((course) => ({
        key: `enrolled workspace ${course.course_code}`, selector: 'a[href^="/student/courses/"]',
        anchor: course.course_code, contains: [course.course_name, 'Open workspace'],
      })) },
    },
    {
      name: 'Registration',
      path: '/student/registration',
      heading: 'Courses',
      evidence: { texts: [...courseCodes, ...courseNames],
        records: courses.map((course) => ({ key: `registration ${course.course_code}`,
          selector: '.rounded-2xl.border.p-4', anchor: course.course_code,
          contains: [course.course_name, `${course.credits} cr`, 'Sem 2'],
        })) },
    },
    {
      name: 'Timetable',
      path: '/student/timetable',
      heading: 'Timetable',
      evidence: { texts: [...courseCodes, 'SMOKE-201'], records: [
        { key: 'published classes', selector: 'button[title]', anchor: 'SMK-PORTAL-', minCount: 6,
          contains: [] },
      ] },
    },
    {
      name: 'Attendance',
      path: '/student/attendance',
      heading: 'Attendance',
      evidence: { records: courses.map((course, index) => ({ key: `attendance ${course.course_code}`,
        selector: 'tbody tr', anchor: course.course_code,
        contains: [course.course_name, index === 0 ? '50.0%' : '100.0%'],
      })) },
    },
    { name: 'Examinations', path: '/student/exams', heading: 'Exams',
      evidence: { records: [{ key: 'three scheduled examinations', selector: 'tbody tr',
        anchor: 'Smoke Academic Block', contains: ['SMOKE', '201', '09:00', '11:00', 'MID TERM'], minCount: 3 }] } },
    { name: 'Marks / Results', path: '/student/marks', heading: 'Results', actions: 'semester-one',
      evidence: { metrics: [{ key: 'overall CGPA', label: 'Overall CGPA', value: '7.50' }],
        records: [
          { key: 'historical computing score', selector: '.rounded-xl.border.p-3',
            anchor: 'SMK-PORTAL-H101', contains: ['Grade A', 'Passed'], patterns: ['\\b82(?:\\.0+)?\\s*/\\s*100(?:\\.0+)?\\b'] },
          { key: 'historical quantitative score', selector: '.rounded-xl.border.p-3',
            anchor: 'SMK-PORTAL-H102', contains: ['Grade C', 'Passed'], patterns: ['\\b52(?:\\.0+)?\\s*/\\s*100(?:\\.0+)?\\b'] },
        ] } },
    { name: 'Published internal marks', path: '/student/marks', heading: 'Results', actions: 'semester-two-internals',
      evidence: { records: [{ key: 'published C201 internal total', selector: '.rounded-2xl.border.p-4',
        anchor: 'SMK-PORTAL-C201', contains: ['Internal total:'], patterns: ['Internal total:\\s*8(?:\\.0+)?\\s*/\\s*10(?:\\.0+)?\\b'] }] } },
    { name: 'Finance', path: '/student/finance', heading: 'Fees & Payments',
      evidence: { metrics: [
        { key: 'total fees', label: 'Total Fee', value: '₹61,500.00' },
        { key: 'paid amount', label: 'Paid Amount', value: '₹15,000.00' },
        { key: 'outstanding amount', label: 'Pending Amount', value: '₹46,500.00' },
      ], records: [
        { key: 'partial real payment', selector: 'tbody tr', anchor: 'CHEQUE', contains: ['₹5,000.00', 'Receipt'] },
        { key: 'full real payment', selector: 'tbody tr', anchor: 'CHEQUE', contains: ['₹10,000.00', 'Receipt'] },
      ] } },
    {
      name: 'Notifications',
      path: '/notifications',
      heading: 'Notification Center',
      evidence: { texts: [`${FIXTURE_PREFIX} Student smoke profile ready`, `${FIXTURE_PREFIX} Coursework reminder`,
        `${FIXTURE_PREFIX} Review your synthetic fee ledger`] },
    },
    {
      name: 'Academic Calendar',
      path: '/student/academic-calendar',
      heading: 'Calendar',
      evidence: { texts: [`${FIXTURE_PREFIX} Campus learning orientation`,
        `${FIXTURE_PREFIX} Department project showcase`, `${FIXTURE_PREFIX} Programme revision workshop`] },
    },
    {
      name: 'Admission Documents',
      path: '/student/admission-vault',
      heading: 'My Documents',
      evidence: { records: [...certificateRecords,
        { key: 'partial actual receipt', selector: 'li', anchor: `${FIXTURE_PREFIX} Partial payment Test receipt`, contains: ['AVAILABLE'] },
        { key: 'fully paid actual receipt', selector: 'li', anchor: `${FIXTURE_PREFIX} Fully paid Test receipt`, contains: ['AVAILABLE'] },
      ] },
    },
    { name: 'Uploaded Certificate Portfolio', path: '/student/admission-vault', heading: 'My Documents',
      evidence: { records: certificateRecords } },
    { name: 'Policies', path: '/student/policies', heading: 'University Policies',
      evidence: { texts: [`${FIXTURE_PREFIX} Synthetic academic integrity policy`,
        `${FIXTURE_PREFIX} Synthetic workshop preference poll`], records: [
        { key: 'mandatory uploaded policy', selector: '.rounded-xl.border.p-4',
          anchor: `${FIXTURE_PREFIX} Synthetic academic integrity policy`, contains: ['Mandatory', 'View PDF Document'] },
        { key: 'optional actual policy poll', selector: '.rounded-xl.border.p-4',
          anchor: `${FIXTURE_PREFIX} Synthetic workshop preference poll`, contains: ['In favour', 'Against', 'View PDF Document'] },
      ] } },
    {
      name: 'Helpdesk',
      path: '/student/helpdesk',
      heading: 'Help & Support',
      evidence: { records: [
        { key: 'resolved helpdesk request', selector: 'a[href*="/helpdesk/"]',
          anchor: `${FIXTURE_PREFIX} Synthetic portal orientation request`, contains: ['RESOLVED'] },
        { key: 'pending helpdesk request', selector: 'a[href*="/helpdesk/"]',
          anchor: `${FIXTURE_PREFIX} Fictional course download support request`, contains: ['PENDING'] },
        { key: 'in-progress helpdesk request', selector: 'a[href*="/helpdesk/"]',
          anchor: `${FIXTURE_PREFIX} Synthetic timetable clarification`, contains: ['IN PROGRESS'] },
      ] },
    },
    { name: 'Mentorship', path: '/student/mentorship', heading: 'Mentorship', evidence: { records: [
      { key: 'approved mentorship meeting', selector: '.rounded-xl.border.p-4',
        anchor: `${FIXTURE_PREFIX} Academic planning meeting`, contains: ['Approved'] },
      { key: 'pending mentorship meeting', selector: '.rounded-xl.border.p-4',
        anchor: `${FIXTURE_PREFIX} Project advice meeting`, contains: ['Pending'] },
      { key: 'approved mentor leave', selector: 'li', anchor: `${FIXTURE_PREFIX} Synthetic academic workshop`, contains: ['APPROVED'] },
      { key: 'pending mentor leave', selector: 'li', anchor: `${FIXTURE_PREFIX} Fictional family appoint`, contains: ['PENDING'] },
    ] } },
  ];
  for (const [index, course] of courses.entries()) {
    const coursePath = `/student/courses/${encodeURIComponent(course.course_id)}`;
    const courseHeading = `${course.course_code} — ${course.course_name}`;
    routes.push({
      name: `Course materials ${course.course_code}`,
      path: coursePath,
      heading: courseHeading,
      evidence: { records: [{ key: `published material ${course.course_code}`, selector: '.rounded-lg.border',
        anchor: `${FIXTURE_PREFIX} ${course.course_code} published notes`, contains: ['NOTES', 'Download'] }] },
    });
    routes.push({
      name: `Assignments ${course.course_code}`,
      path: `${coursePath}?tab=assignments`,
      heading: courseHeading,
      evidence: { records: [{ key: `assignment ${course.course_code}`, selector: '.bg-card',
        anchor: `SMOKE TEST — ${['Programming Exercise', 'Database Design Report', 'Responsible AI Reflection'][index]}`,
        contains: index === 0 ? ['Pending', 'Max marks: 20'] : index === 1 ? ['SUBMITTED', 'Submitted'] : ['GRADED', 'Marks scored:'],
        ...(index === 2 ? { patterns: ['Marks scored:\\s*16(?:\\.0+)?\\s*/\\s*20(?:\\.0+)?\\b'] } : {}),
      }] },
    });
    routes.push({
      name: `Course announcements ${course.course_code}`,
      path: `${coursePath}?tab=announcements`,
      heading: courseHeading,
      evidence: { records: [{ key: `faculty announcement ${course.course_code}`, selector: '.rounded-xl.border.p-4',
        anchor: `${FIXTURE_PREFIX} ${course.course_code} preparation announcement`,
        contains: ['Review the worked examples before the next class.', 'synthetic smoke-test data.'] }] },
    });
  }
  return routes;
}

async function verifyBrowser(ctx) {
  const web = ctx.config?.web;
  if (!web) {
    ctx.blocked(
      'real Student browser smoke',
      'No isolated local frontend URL was configured; browser checks were not executed.',
    );
    return { status: 'BLOCKED', routes: [], errors: [] };
  }
  const webOrigin = localOrigin(web);
  if (!webOrigin)
    throw new Error(
      'Browser verification requires an explicitly local frontend origin without embedded credentials',
    );
  const api = ctx.config.api ?? ctx.config.apiUrl ?? ctx.config.backend;
  const allowedOrigins = new Set([webOrigin]);
  if (api) {
    const apiOrigin = localOrigin(api);
    if (!apiOrigin)
      throw new Error('Browser verification refuses a remote backend origin');
    allowedOrigins.add(apiOrigin);
    // The frontend intentionally rejects a baked localhost API on a tenant
    // hostname. The same loopback server may therefore use the tenant alias.
    const tenantAlias = new URL(apiOrigin);
    tenantAlias.hostname = new URL(webOrigin).hostname;
    allowedOrigins.add(tenantAlias.origin);
  }
  const student = ctx.actors?.student;
  if (
    !student?.email ||
    !student?.password ||
    !ctx.ids?.studentId ||
    !ctx.ids?.tenantId
  ) {
    throw new Error(
      'Real browser login requires the dedicated synthetic Student identity and an in-memory password',
    );
  }
  const playwright = loadPlaywright();
  const executablePath = browserExecutable(
    playwright,
    ctx.config.browserExecutablePath,
  );
  if (!playwright || !executablePath) {
    ctx.blocked(
      'real Student browser smoke',
      'Installed Playwright/browser executable unavailable; no package or browser was downloaded and no UI checks were executed.',
    );
    return { status: 'BLOCKED', routes: [], errors: [] };
  }

  let browser;
  const results = [];
  const errors = [];
  const externalBlocked = new Set();
  let currentRoute = 'Login';
  const safe = (value) => sanitize(value, ctx.actors);
  const timeout = Math.min(
    Math.max(Number(ctx.config.browserTimeoutMs) || 60000, 10000),
    60000,
  );
  try {
    browser = await playwright.chromium.launch({
      executablePath,
      headless: true,
      timeout,
      args: [
        '--host-resolver-rules=MAP *.localhost 127.0.0.1',
        '--disable-background-networking',
        '--no-first-run',
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    // A network safety fence only: no local API response is intercepted or faked.
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (/^(data|blob|about):/.test(requestUrl)) return route.continue();
      const origin = localOrigin(requestUrl);
      if (origin && allowedOrigins.has(origin)) return route.continue();
      externalBlocked.add(urlPath(requestUrl));
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    page.on('pageerror', (error) =>
      errors.push({
        route: errorRoute(error.message, currentRoute),
        type: 'pageerror',
        message: safe(error.message),
      }),
    );
    page.on('console', (message) => {
      if (message.type() === 'error')
        errors.push({
          route: errorRoute(message.text(), currentRoute),
          type: 'console',
          message: safe(message.text()),
        });
    });
    page.on('response', (response) => {
      if (
        response.status() >= 400 &&
        allowedOrigins.has(localOrigin(response.url()))
      ) {
        errors.push({
          route: currentRoute,
          type: 'http',
          status: response.status(),
          path: urlPath(response.url()),
        });
      }
    });
    page.on('requestfailed', (request) => {
      if (!allowedOrigins.has(localOrigin(request.url()))) return;
      const reason = request.failure()?.errorText ?? 'request failed';
      // Browser navigation cancels requests; these are not completed HTTP failures.
      if (reason.includes('ERR_ABORTED')) return;
      errors.push({
        route: currentRoute,
        type: 'network',
        path: urlPath(request.url()),
        message: safe(reason),
      });
    });

    const loginStartErrors = errors.length;
    const home = await page.goto(`${webOrigin}/`, {
      waitUntil: 'domcontentloaded',
    });
    if (!home?.ok())
      throw new Error(`Login page HTTP ${home?.status() ?? 'no response'}`);
    await page
      .getByLabel('Email or Student ID', { exact: true })
      .fill(student.email);
    await page.getByLabel('Password', { exact: true }).fill(student.password);
    const [login] = await Promise.all([
      page.waitForResponse(
        (response) =>
          urlPath(response.url()) === '/api/auth/local-login' &&
          response.request().method() === 'POST',
        { timeout },
      ),
      page
        .getByRole('button', { name: 'Sign in with Password', exact: true })
        .click(),
    ]);
    if (!login.ok())
      throw new Error(`Existing password-login API HTTP ${login.status()}`);
    const authenticated = await login.json();
    if (
      authenticated.user?.user_id !== ctx.ids.studentId ||
      authenticated.user?.tenant_id !== ctx.ids.tenantId
    ) {
      throw new Error(
        'The real login response did not identify the dedicated synthetic Student in its own tenant',
      );
    }
    await page.waitForURL((url) => url.pathname === '/student/dashboard', {
      timeout,
    });
    await page
      .getByText('Degree Progress', { exact: true })
      .first()
      .waitFor({ state: 'visible' });
    const loginOk = errors.length === loginStartErrors;
    ctx.check(
      'Browser real password login',
      loginOk,
      loginOk
        ? 'Completed the existing login form and reached the real Student dashboard without injected authentication.'
        : safe(JSON.stringify(errors.slice(loginStartErrors))),
    );
    results.push({ name: 'Real password login', path: '/', pass: loginOk });

    for (const route of browserRoutes(ctx.ids, ctx)) {
      currentRoute = route.name;
      const before = errors.length;
      let pass = true;
      let detail =
        'Real route and expected visible fixture records/values; no observed console/page/API errors. No form submissions or payment actions.';
      try {
        const response = await page.goto(`${webOrigin}${route.path}`, {
          waitUntil: 'domcontentloaded',
        });
        if (!response?.ok())
          throw new Error(`Page HTTP ${response?.status() ?? 'no response'}`);
        await page.waitForURL(
          (url) => url.pathname === route.path.split('?')[0],
          { timeout },
        );
        if (route.heading)
          await page
            .getByRole('heading', { name: route.heading, exact: true })
            .first()
            .waitFor({ state: 'visible' });
        for (const panel of route.panels ?? [])
          await page
            .getByText(panel, { exact: true })
            .first()
            .waitFor({ state: 'visible' });
        // Network-idle waits for real data requests rather than an arbitrary delay.
        await page.waitForLoadState('networkidle', { timeout });
        // These are presentation-only filters. Never click acknowledgment,
        // voting, upload, submission, payment, or result-publication actions.
        if (route.actions === 'semester-one') {
          await page.getByRole('button', { name: /^Sem\s*1$/ }).click();
        } else if (route.actions === 'semester-two-internals') {
          await page.getByRole('button', { name: /^Sem\s*2$/ }).click();
          await page.getByRole('button', { name: 'Internal marks', exact: true }).click();
        }
        const content = (await page.locator('body').innerText()).replace(
          /\s+/g,
          ' ',
        );
        if (!content.trim()) throw new Error('Blank page');
        const main = page.locator('main').first();
        if (!route.evidence) throw new Error('Route has no defined fixture evidence; a heading-only check cannot pass.');
        const observed = await waitForFixtureEvidence(() => collectEvidence(main, route.evidence), route.evidence, timeout);
        if (
          /Application error:|Unable to load this course|Could not load courses|Could not load mentorship|Vault unavailable|Registration unavailable|Attendance unavailable|Course enrollment sync is unavailable|Some dashboard data is unavailable|Sign in to view your notifications|Something went wrong/i.test(
            observed.content,
          )
        ) {
          throw new Error(
            'The page displayed an error or incomplete-data state',
          );
        }
      } catch (error) {
        pass = false;
        detail = safe(error.message);
      }
      const routeErrors = errors.slice(before).filter((error) => error.route === route.name);
      if (routeErrors.length) {
        pass = false;
        detail += ` Observed: ${safe(JSON.stringify(routeErrors))}`;
      }
      ctx.check(`Browser ${route.name}`, pass, detail);
      results.push({ name: route.name, path: route.path, pass });
    }

    // Only resize/navigate; no buttons that would modify academic/financial data.
    currentRoute = 'Mobile dashboard';
    const mobileBefore = errors.length;
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${webOrigin}/student/dashboard`, {
        waitUntil: 'domcontentloaded',
      });
      await page
        .getByText('Degree Progress', { exact: true })
        .first()
        .waitFor({ state: 'visible' });
      await page.waitForLoadState('networkidle', { timeout });
      const dashboard = browserRoutes(ctx.ids, ctx).find((route) => route.name === 'Dashboard');
      await waitForFixtureEvidence(() => collectEvidence(page.locator('main').first(), dashboard.evidence), dashboard.evidence, timeout);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      const pass = !overflow && errors.length === mobileBefore;
      ctx.check(
        'Browser mobile dashboard',
        pass,
        overflow
          ? 'Document overflows the 390px viewport.'
          : 'Actual pending assignment and earned credits rendered at 390px without horizontal document overflow.',
      );
      results.push({
        name: 'Mobile dashboard',
        path: '/student/dashboard',
        pass,
      });
    } catch (error) {
      ctx.check('Browser mobile dashboard', false, safe(error.message));
      results.push({
        name: 'Mobile dashboard',
        path: '/student/dashboard',
        pass: false,
      });
    }
    if (externalBlocked.size)
      ctx.blocked(
        'browser remote integrations',
        `Remote resource requests were intentionally blocked by the local-only smoke-test safety fence (${externalBlocked.size} resource paths). No external integrations were exercised.`,
      );
    // Reconcile errors whose component stack arrived after its route check.
    for (const result of results) {
      const late = errors.filter((error) => error.route === result.name);
      if (!late.length || !result.pass) continue;
      result.pass = false;
      const details = `Observed actual route errors (including delayed React diagnostics): ${safe(JSON.stringify(late))}`;
      const recorded = ctx.report?.tests?.find((entry) => entry.name === `Browser ${result.name}`);
      if (recorded) { recorded.status = 'FAIL'; recorded.details = details; }
      else ctx.check(`Browser ${result.name} delayed diagnostics`, false, details);
    }
    return {
      status: results.every((result) => result.pass) ? 'PASS' : 'FAIL',
      routes: results,
      errors,
    };
  } catch (error) {
    const detail = safe(error.message);
    ctx.check('Browser real Student session', false, detail);
    return {
      status: 'FAIL',
      routes: results,
      errors: [
        ...errors,
        { route: currentRoute, type: 'session', message: detail },
      ],
    };
  } finally {
    if (browser)
      await browser.close().catch(() => {
        ctx.blocked(
          'browser cleanup',
          'The isolated browser did not confirm a clean close; no persistent browser profile was used.',
        );
      });
  }
}

module.exports = {
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
  collectEvidence,
};
