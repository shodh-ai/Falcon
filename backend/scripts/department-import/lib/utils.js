const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const BACKEND = path.join(__dirname, '..', '..', '..');
const DATA_ROOT = path.join(BACKEND, 'data', 'departments');
const DOCS_ROOT = path.join(BACKEND, '..', 'docs');

function loadEnvFile() {
  const envPath = path.join(BACKEND, '.env');
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

function dbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'university_governance',
  };
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, idx) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    values.push(current);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    row._line = idx + 2;
    return row;
  });
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function normalizeSubType(raw, courseName, courseCode) {
  const v = String(raw || '').trim().toUpperCase();
  const map = { TH: 'THEORY', THEORY: 'THEORY', LAB: 'LAB', SKILL: 'SKILL', PROJECT: 'PROJECT' };
  if (map[v]) return map[v];
  const name = `${courseName} ${courseCode}`.toLowerCase();
  if (name.includes('lab') || String(courseCode).endsWith('P')) return 'LAB';
  return 'THEORY';
}

function loadConfig(slug) {
  const configPath = path.join(DATA_ROOT, slug, 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing department config: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function deptDir(slug) {
  return path.join(DATA_ROOT, slug);
}

function writeMarkdown(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function renderReport(title, sections) {
  const parts = [`# ${title}`, '', `Generated: ${new Date().toISOString()}`, ''];
  for (const [heading, body] of sections) {
    parts.push(`## ${heading}`, '', body, '');
  }
  return parts.join('\n');
}

function tableFromRows(rows, columns) {
  if (!rows.length) return '_No records._';
  const header = `| ${columns.join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows
    .map((row) => `| ${columns.map((c) => String(row[c] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)
    .join('\n');
  return [header, sep, body].join('\n');
}

module.exports = {
  BACKEND,
  DATA_ROOT,
  DOCS_ROOT,
  loadEnvFile,
  dbConfig,
  readCsv,
  normalizeCode,
  normalizeSubType,
  loadConfig,
  deptDir,
  writeMarkdown,
  renderReport,
  tableFromRows,
};
