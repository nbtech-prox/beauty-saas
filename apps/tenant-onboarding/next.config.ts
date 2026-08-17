import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Tenant onboarding é uma Next app cliente; sem transpilePackages
  // porque os packages workspace já expõem src/index.ts e o Bundler
  // module resolution do Next 16 trata deles directamente.
};

export default nextConfig;
