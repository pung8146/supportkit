import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@supportkit/widget'],
  async headers() {
    return [
      {
        // loader.js keeps one URL across releases, so caches must recheck it soon.
        source: '/widget/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=86400' },
          // Lets customer sites measure the widget's load time in their own monitoring.
          { key: 'Timing-Allow-Origin', value: '*' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        // The admin must never be framed; /embed sets its own per-bot frame-ancestors.
        source: '/((?!embed/|widget/|api/widget/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
