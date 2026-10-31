import { defineConfig, devices } from '@playwright/test';

// Runs against `wrangler dev` with a fresh local D1 (see tests/e2e/start-server.sh).
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:8788', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'bash tests/e2e/start-server.sh',
    url: 'http://localhost:8788/healthz',
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: '../..',
  },
});
