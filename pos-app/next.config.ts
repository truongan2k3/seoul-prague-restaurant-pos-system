import type { NextConfig } from "next";

function supabaseHostname(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

const supabaseHost = supabaseHostname();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  images: {
    // Resize/cache Supabase public media via /_next/image (cuts guest storage egress).
    remotePatterns: [
      ...(supabaseHost
        ? ([
            {
              protocol: "https",
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
            {
              protocol: "https",
              hostname: supabaseHost,
              pathname: "/storage/v1/render/image/public/**",
            },
          ] as const)
        : []),
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/render/image/public/**",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/landing", destination: "/", permanent: true },
      { source: "/landing/menu", destination: "/menu", permanent: true },
    ];
  },
};

export default nextConfig;
