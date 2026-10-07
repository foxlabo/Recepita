import { defineConfig, devices } from '@playwright/test';
import { testDatabaseUrl } from './tests/support/test-db';

// E2E tests run against the production build (`npm run build` first) served
// by `next start` on port 4450, using the test database (TEST_DATABASE_URL or
// DATABASE_URL; its name must contain "test"). The global setup applies the
// migrations and seeds the E2E users (tests/e2e/seed.ts).
const PORT = 4450;
const baseURL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // Spec files use separate accounts, so they may run in parallel; tests in a
  // file run in order.
  fullyParallel: false,
  workers: isCI ? 2 : undefined,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `${baseURL}/api/ping`,
    // Never attach to some other server that might use another database.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      DATABASE_URL: testDatabaseUrl(),
      JWT_SECRET: process.env.JWT_SECRET || 'e2e-jwt-secret-0123456789abcdef-0123456789',
      APP_URL: baseURL,
      OCR_PROVIDER: '',
      OPENAI_API_KEY: '',
      AZURE_COMMUNICATION_CONNECTION_STRING: '',
    },
  },
});
