import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

function loadEnvValue(key: string, fallback: string): string {
  const envPath = path.join(__dirname, '..', '.env.test');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      if (line.startsWith(`${key}=`)) {
        return line.split('=')[1]?.trim() ?? fallback;
      }
    }
  }
  return process.env[key] ?? fallback;
}

export const test = base.extend({
  apiUrl: async (_fixtures, use) => {
    await use(loadEnvValue('FALCON_API_URL', 'http://localhost:4000'));
  },
  tenant: async (_fixtures, use) => {
    await use(loadEnvValue('FALCON_TENANT', 'sgvu'));
  },
});

export { expect };
