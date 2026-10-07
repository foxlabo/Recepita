import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const serverOnlyStub = fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url));

export default defineConfig({
  resolve: {
    // "@/…" imports from tsconfig.json
    tsconfigPaths: true,
    // `import 'server-only'` throws outside a React Server Components build.
    alias: { 'server-only': serverOnlyStub },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // Not JST and with DST: date logic must not depend on the machine's zone.
          env: { TZ: 'America/Los_Angeles' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup-env.ts'],
          // One database: run files one after another.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
