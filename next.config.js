/** @type {import('next').NextConfig} */
const nextConfig = {
  // ⚡ Cloudflare Pages Optimization
  output: 'export',
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  
  // 🔧 React Compiler
  reactCompiler: true,

  // 🛑 FIX TURBOPACK
  turbopack: {
    // Optional: add specific turbopack configurations here if needed
  },

  // ✅ Allowed development origins to prevent cross-origin errors
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://192.168.1.2:3000', // Your local network IP
    // Add other local IPs if you access from different devices
  ],

  // 🌐 Environment variables
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_WORKER_URL: process.env.NEXT_PUBLIC_WORKER_URL,
    NEXT_PUBLIC_TOKEN_SECRET: process.env.NEXT_PUBLIC_TOKEN_SECRET,
    NEXT_PUBLIC_ADMIN_USERNAME: process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin',
    NEXT_PUBLIC_ADMIN_PASSWORD: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '123',
  },

  // 📝 Webpack config fallback
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    return config;
  },

  compress: true,
  poweredByHeader: false,
  trailingSlash: true,
};

module.exports = nextConfig;
