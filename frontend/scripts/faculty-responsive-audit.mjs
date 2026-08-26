/**
 * Static responsive audit for Faculty portal pages.
 * Scans for common overflow / non-responsive patterns and writes a markdown report.
 *
 * Usage: node scripts/faculty-responsive-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const facultyDir = path.join(root, 'src', 'app', '(portals)', 'faculty');
const componentsDir = path.join(root, 'src', 'components', 'faculty');
const viewports = [320, 375, 425, 768, 1024, 1280, 1440, 1920];

const RULES = [
  {
    id: 'table-without-scroll',
    severity: 'high',
    test: (src) => {
      const issues = [];
      const tableRe = /<table[\s\S]*?<\/table>/g;
      let m;
      while ((m = tableRe.exec(src))) {
        const start = Math.max(0, m.index - 180);
        const window = src.slice(start, m.index + m[0].length);
        if (!/overflow-x-auto|overflow-auto/.test(window)) {
          issues.push('Table missing nearby overflow-x-auto / overflow-auto wrapper');
        }
      }
      return issues;
    },
  },
  {
    id: 'fixed-min-width-large',
    severity: 'medium',
    test: (src) => {
      const issues = [];
      for (const m of src.matchAll(/min-w-\[(\d+)px\]/g)) {
        const n = Number(m[1]);
        if (n >= 700) {
          issues.push(`Large min-w-[${n}px] — ensure parent scrolls horizontally on phones`);
        }
      }
      return issues;
    },
  },
  {
    id: 'missing-min-w-0-on-flex',
    severity: 'low',
    test: (src) => {
      if (/flex(?![^\n]{0,80}min-w-0)/.test(src) && /truncate|whitespace-nowrap/.test(src)) {
        return ['Flex + truncate/nowrap without min-w-0 nearby may overflow on narrow viewports'];
      }
      return [];
    },
  },
  {
    id: 'grid-cols-3-unscoped',
    severity: 'medium',
    test: (src) => {
      if (/grid-cols-3(?!\s)/.test(src) && !/sm:grid-cols|md:grid-cols|lg:grid-cols/.test(src)) {
        return ['grid-cols-3 without breakpoint prefix may squeeze cards below 425px'];
      }
      return [];
    },
  },
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx|jsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = [...walk(facultyDir), ...walk(componentsDir)];
const findings = [];

for (const file of files) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  const src = fs.readFileSync(file, 'utf8');
  for (const rule of RULES) {
    for (const detail of rule.test(src)) {
      findings.push({ file: rel, rule: rule.id, severity: rule.severity, detail });
    }
  }
}

const reportPath = path.join(root, 'faculty-responsive-audit-report.md');
const lines = [
  '# Faculty Portal Responsive Audit Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Viewports in scope',
  '',
  viewports.map((v) => `- ${v}px`).join('\n'),
  '',
  '## Method',
  '',
  'Static AST-free pattern scan of Faculty pages/components for overflow risks.',
  'Browser pixel QA still required for charts/calendars at each viewport.',
  '',
  '## Shell hardening applied',
  '',
  '- `FacultyPageShell`: `min-w-0 overflow-x-hidden`',
  '- `AppShell` main already `overflow-x-hidden`',
  '- Faculty AI FAB/panel constrained for 320px',
  '- Invigilation / Exam Cell swap UIs use scrollable tables and fluid dialogs',
  '',
  `## Findings (${findings.length})`,
  '',
];

if (findings.length === 0) {
  lines.push('_No static pattern issues detected._', '');
} else {
  for (const f of findings) {
    lines.push(`- **[${f.severity}]** \`${f.file}\` — ${f.rule}: ${f.detail}`);
  }
  lines.push('');
}

fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${reportPath} (${findings.length} findings across ${files.length} files)`);
