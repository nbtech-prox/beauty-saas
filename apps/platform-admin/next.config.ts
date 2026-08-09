import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Não usamos transpilePackages — os packages do workspace já têm TS puro.
  // Next 16 resolve via Bundler module resolution.
  experimental: {
    // Mantém os packages workspace resolvidos via TS source (não dist).
    // Por defeito, Next já faz isto se os packages têm "main"/"types" a apontar para src/.
  },
};

export default nextConfig;