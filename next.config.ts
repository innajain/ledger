import type { NextConfig } from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })

const nextConfig: NextConfig = {
  // Production optimizations
  compress: true,
  poweredByHeader: false,
}

export default withBundleAnalyzer(nextConfig)
