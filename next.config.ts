import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  
  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['@/generated/prisma/client', 'react-datepicker'],
    // Enable partial prerendering when stable
    // ppr: 'incremental',
  },
  
  // Reduce bundle size by tree-shaking
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{member}}',
    },
  },

  // Enable React strict mode for better development
  reactStrictMode: true,
};

export default nextConfig;
