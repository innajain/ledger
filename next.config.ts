import type { NextConfig } from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })

const nextConfig: NextConfig = {
  // Deploy builds (scripts/deploy.sh) ship a self-contained server with only the
  // node_modules it traces as needed. Local `pnpm build` pairs with `pnpm start`.
  output: process.env.NEXT_OUTPUT_STANDALONE === '1' ? 'standalone' : undefined,

  compress: true,
  poweredByHeader: false,

  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*'],

  // The dev server otherwise prints every server action's arguments verbatim —
  // log_in's password, amounts, account names — into the terminal.
  logging: { serverFunctions: false },

  // Keep these server dependencies external to the server bundle.
  serverExternalPackages: ['ioredis', 'pino', 'yahoo-finance2', 'web-push'],

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    // No `inlineCss`: it saved one round trip on a first visit but put the whole
    // stylesheet into every HTML response three times over (a <style> tag plus two copies
    // in the RSC payload, ~230 KB of a ~270 KB page), where a stylesheet file is fetched
    // once and then cached.
    optimizePackageImports: ['date-fns', 'date-fns-tz', 'recharts', 'lightweight-charts'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
        ],
      },
    ]
  },

  async redirects() {
    const families: [string, string][] = [
      ['/accounts', '/heads/account'],
      ['/allocations', '/heads/allocation'],
      ['/income_expenses', '/heads/income_expense'],
    ]
    // 308s so browsers and the CDN cache the legacy routes instead of re-resolving each visit.
    return families.flatMap(([from, to]) => [
      { source: from, destination: to, permanent: true },
      { source: `${from}/:path*`, destination: `${to}/:path*`, permanent: true },
    ])
  },
}

export default withBundleAnalyzer(nextConfig)
