/**
 * Lightweight biometric punch forwarder for on-prem Windows/Linux machines.
 * Polls a local log file every 5 minutes and POSTs new punches to Falcon cloud API.
 *
 * Usage: node listener.js
 * Configure via .env (see .env.example)
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = process.env.BIOMETRIC_LOG_FILE || './biometric-punches.log';
const API_URL = process.env.FALCON_API_URL || 'http://localhost:4000/api/hr/biometrics/sync';
const API_KEY = process.env.HR_BIOMETRIC_API_KEY || '';
const ENTITY_ID = process.env.ENTITY_ID || '1';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5 * 60 * 1000);
const STATE_FILE = process.env.STATE_FILE || './listener-state.json';

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastOffset: 0, sentHashes: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function parseLine(line) {
  // Expected formats:
  // emp_id,timestamp,device_id,IN
  // emp_id|timestamp|device_id|OUT
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const parts = trimmed.includes('|') ? trimmed.split('|') : trimmed.split(',');
  if (parts.length < 2) return null;

  const [emp_id, timestamp, device_id = 'LOCAL-01', punch_type = 'IN'] = parts;
  return {
    employee_id: emp_id.trim(),
    punch_time: new Date(timestamp.trim()).toISOString(),
    device_id: device_id.trim(),
    punch_type: (punch_type.trim().toUpperCase() === 'OUT' ? 'OUT' : 'IN'),
    entity_id: Number(ENTITY_ID),
  };
}

async function postPunches(punches) {
  if (!punches.length) return;
  if (!API_KEY) {
    throw new Error('HR_BIOMETRIC_API_KEY is not configured');
  }

  const res = await fetch(`${API_URL}?entity_id=${ENTITY_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': API_KEY,
    },
    body: JSON.stringify({ punches }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  console.log(`[${new Date().toISOString()}] Synced ${punches.length} punch(es)`);
}

async function pollOnce() {
  if (!fs.existsSync(LOG_FILE)) {
    console.warn(`Log file not found: ${LOG_FILE}`);
    return;
  }

  const state = loadState();
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const lines = content.split('\n').slice(state.lastOffset);
  state.lastOffset = content.split('\n').length;

  const sentSet = new Set(state.sentHashes || []);
  const punches = [];

  for (const line of lines) {
    const punch = parseLine(line);
    if (!punch) continue;
    const hash = `${punch.employee_id}|${punch.punch_time}|${punch.punch_type}`;
    if (sentSet.has(hash)) continue;
    punches.push(punch);
    sentSet.add(hash);
  }

  if (punches.length) {
    await postPunches(punches);
    state.sentHashes = Array.from(sentSet).slice(-5000);
  }

  saveState(state);
}

async function main() {
  console.log(`Biometric listener started. Polling ${LOG_FILE} every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`Target: ${API_URL}?entity_id=${ENTITY_ID}`);

  await pollOnce();
  setInterval(() => {
    pollOnce().catch((err) => console.error('Poll error:', err.message));
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
