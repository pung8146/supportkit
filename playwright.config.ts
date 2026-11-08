import { defineConfig } from '@playwright/test';

const pnpm = 'corepack pnpm';
const staticHost = (dir: string, port: number) => ({
  command: `node scripts/serve-static.mjs ${dir} ${port}`,
  url: `http://localhost:${port}`,
  reuseExistingServer: !process.env.CI,
});

export default defineConfig({
  testDir: 'e2e',
  use: { browserName: 'chromium' },
  webServer: [
    {
      command: `${pnpm} --filter @supportkit/widget build && ${pnpm} --filter @supportkit/admin build && ${pnpm} --filter @supportkit/admin start`,
      url: 'http://localhost:3000',
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        WIDGET_TOKEN_SECRET: 'e2e-only-secret-e2e-only-secret-0000',
        DEMO_ALLOWED_ORIGINS: 'http://localhost:5174,http://localhost:5175',
      },
    },
    staticHost('apps/demo-shop', 5174),
    staticHost('e2e/hosts', 5175), // allowed
    staticHost('e2e/hosts', 5176), // not allowed
  ],
});
