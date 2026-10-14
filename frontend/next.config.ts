import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip Next's default trailing-slash redirect (308): it strips the slash
  // off /api/v1/... before the rewrites match, breaking every DRF endpoint.
  skipTrailingSlashRedirect: true,
  // Dev-server resources are host-restricted by default; allow LAN devices.
  allowedDevOrigins: ["192.168.1.138", "192.168.6.195"],
  // Same-origin API: proxy /api/v1/* and /media/* to the Django backend
  // server-side (CORS is only a fallback). API_PROXY_URL selects the backend.
  async rewrites() {
    const backend = process.env.API_PROXY_URL || "http://127.0.0.1:8000";
    return [
      // The :path* matcher drops the trailing slash every DRF URL needs;
      // re-adding it in the destination avoids an APPEND_SLASH redirect loop.
      {
        source: "/api/v1/:path*",
        destination: `${backend}/api/v1/:path*/`,
      },
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
    ];
  },
  images: {
    dangerouslyAllowLocalIP: true,
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/media/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/media/**",
      },
      {
        protocol: "http",
        hostname: "192.168.1.138",
        port: "8000",
        pathname: "/media/**",
      },
      {
        protocol: "http",
        hostname: "192.168.6.195",
        port: "8000",
        pathname: "/media/**",
      },
      {
        protocol: "https",
        hostname: "**",
        pathname: "/media/**",
      },
    ],
  },
};

export default nextConfig;
