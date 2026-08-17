import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    typescript: {
      buildMode: 'standalone',
    },
  },
};

export default nextConfig;
