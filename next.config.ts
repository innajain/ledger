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
}

export default withBundleAnalyzer(nextConfig)
