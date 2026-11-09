import { defineConfig } from '@playwright/test';

const pnpm = 'corepack pnpm';
const staticHost = (dir: string, port: number) => ({
  command: `node scripts/serve-static.mjs ${dir} ${port}`,
  url: `http://localhost:${port}`,
  reuseExistingServer: !process.env.CI,
});

export default defineConfig({
  testDir: 'e2e',
  workers: 1, // tests share the local Supabase demo bot
  use: { browserName: 'chromium' },
  webServer: [
    {
      command: `${pnpm} --filter @supportkit/widget build && ${pnpm} --filter @supportkit/admin build && ${pnpm} --filter @supportkit/admin start`,
      url: 'http://localhost:3000',
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      // Supabase settings come from apps/admin/.env.local; allowed origins from supabase/seed.sql.
      env: { WIDGET_TOKEN_SECRET: 'e2e-only-secret-e2e-only-secret-0000' },
    },
    staticHost('apps/demo-shop', 5174),
    staticHost('e2e/hosts', 5175), // allowed
    staticHost('e2e/hosts', 5176), // not allowed
  ],
});
