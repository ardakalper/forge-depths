import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 30_000, fullyParallel: true, retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4181', locale: 'en-US', viewport: { width: 1280, height: 800 } },
  webServer: { command: 'node tools/serve.mjs 4181', url: 'http://localhost:4181/', reuseExistingServer: !process.env.CI },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) } } }],
});
