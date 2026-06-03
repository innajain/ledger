import type { NextConfig } from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })

const nextConfig: NextConfig = {
  // Production optimizations
  compress: true,
  poweredByHeader: false,

  // Allow loading `next dev` resources (HMR, client runtime) when the app is
  // opened from another device on the LAN — e.g. testing on a phone via the
  // Mac's local IP. Dev-only; ignored in production builds.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*'],

  // The per-type head routes (/accounts, /allocations, /income_expenses) were
  // consolidated into a single /heads/[type] route. Redirect the old paths so
  // existing links and bookmarks keep working.
  async redirects() {
    const families: [string, string][] = [
      ['/accounts', '/heads/account'],
      ['/allocations', '/heads/allocation'],
      ['/income_expenses', '/heads/income_expense'],
    ]
    return families.flatMap(([from, to]) => [
      { source: from, destination: to, permanent: false },
      { source: `${from}/:path*`, destination: `${to}/:path*`, permanent: false },
    ])
  },
}

export default withBundleAnalyzer(nextConfig)
