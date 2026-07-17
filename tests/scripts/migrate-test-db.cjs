#!/usr/bin/env node
/**
 * Apply backend migrations to the test database defined in tests/.env.test
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function loadTestEnv() {
  const envPath = path.join(__dirname, '..', '.env.test');
  if (!fs.existsSync(envPath)) {
    console.error('Missing tests/.env.test — copy from .env.test.example');
    process.exit(1);
  }
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
    process.env[key] = val;
  }
}

loadTestEnv();

const backendDir = path.join(__dirname, '..', '..', 'backend');
const result = spawnSync('node', ['scripts/run-migrations.js'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
  },
});

process.exit(result.status ?? 1);
