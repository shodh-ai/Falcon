import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  turbopack: {
    // Pin root to frontend/ — avoids picking up stray lockfiles (e.g. ~/package-lock.json)
    root: path.resolve(__dirname),
  },
  experimental: {
    // Keep production builds safe on the shared Coolify host. Without this,
    // Next.js sizes workers from host CPUs (nine workers on the current VPS),
    // which causes large simultaneous memory spikes while prerendering.
    cpus: 2,
    memoryBasedWorkersCount: false,
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'echarts',
      'echarts-for-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/uploads/download?path=/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
