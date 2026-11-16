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
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: 'perf.spec.ts' },
    { name: 'perf', use: { browserName: 'chromium' }, testMatch: 'perf.spec.ts' },
    // The widget runs on customers' sites in every browser. The admin and perf specs stay on Chromium:
    // each admin test signs in anonymously and Supabase allows 30 such sign-ins per hour per IP.
    { name: 'firefox', use: { browserName: 'firefox' }, testMatch: 'embed.spec.ts' },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: 'embed.spec.ts' },
  ],
  webServer: [
    {
      command: `${pnpm} --filter @supportkit/widget build && ${pnpm} --filter @supportkit/admin build && ${pnpm} --filter @supportkit/admin start`,
      url: 'http://localhost:3000',
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      // Supabase settings come from apps/admin/.env.local; allowed origins from supabase/seed.sql.
      // An empty key overrides .env.local so E2E never sends real email.
      // Per-IP and daily limits are raised because every test shares localhost; the per-bot monthly
      // limit stays real and is exercised by its own test.
      env: {
        WIDGET_TOKEN_SECRET: 'e2e-only-secret-e2e-only-secret-0000',
        LLM_MODE: 'fake',
        RESEND_API_KEY: '',
        LIMIT_CHAT_PER_IP_HOURLY: '100000',
        LIMIT_ANSWERS_PER_DAY: '100000',
        LIMIT_ANSWERS_PER_BOT_DAILY: '100000',
        LIMIT_INQUIRIES_PER_IP_HOURLY: '100000',
        LIMIT_INQUIRIES_PER_BOT_DAILY: '100000',
        LIMIT_DEMOS_PER_IP_DAILY: '100000',
        LIMIT_DEMOS_PER_DAY: '100000',
      },
    },
    staticHost('apps/demo-shop', 5174),
    staticHost('e2e/hosts', 5175), // allowed
    staticHost('e2e/hosts', 5176), // not allowed
  ],
});
