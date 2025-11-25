import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Отключаем кеширование для API и realtime данных
  async headers() {
    return [
      {
        source: '/room/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
