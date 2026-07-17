import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';

function loadWebBase(): string {
  const envPath = path.join(__dirname, '..', '.env.test');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      if (line.startsWith('FALCON_WEB_URL=')) {
        return line.split('=')[1]?.trim() ?? 'http://localhost:3000';
      }
    }
  }
  return process.env.FALCON_WEB_URL ?? 'http://localhost:3000';
}

const baseURL = loadWebBase();

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../playwright-report' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    cwd: path.join(__dirname, '..', '..', 'frontend'),
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
