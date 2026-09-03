import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
  async redirects() {
    return [
      { source: "/landing", destination: "/", permanent: true },
      { source: "/landing/menu", destination: "/menu", permanent: true },
    ];
  },
};

export default nextConfig;
