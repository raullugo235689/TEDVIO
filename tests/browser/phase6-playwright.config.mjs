import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'phase6-cutover.spec.mjs',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 15 Pro'] } },
  ],
  webServer: {
    command: 'node tests/browser/phase6-server.mjs',
    cwd: '../..',
    port: 4174,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
