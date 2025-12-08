/** @type {import('next').NextConfig} */
const nextConfig = {
  // Matikan turbopack sepenuhnya
  experimental: {
    turbo: false
  },

  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },

  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_WORKER_URL: process.env.NEXT_PUBLIC_WORKER_URL,
    NEXT_PUBLIC_TOKEN_SECRET: process.env.NEXT_PUBLIC_TOKEN_SECRET,
    NEXT_PUBLIC_ADMIN_USERNAME: process.env.NEXT_PUBLIC_ADMIN_USERNAME || "admin",
    NEXT_PUBLIC_ADMIN_PASSWORD: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "123",
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
