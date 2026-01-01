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
};

export default nextConfig;
