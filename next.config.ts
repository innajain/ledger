import type { NextConfig } from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,

  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*'],

  // Node-only server deps stay external instead of being bundled into the server output.
  serverExternalPackages: ['ioredis', 'pino', 'yahoo-finance2', 'web-push'],

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    // Inline the (render-blocking) CSS into the HTML — saves a round trip before first paint.
    inlineCss: true,
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
