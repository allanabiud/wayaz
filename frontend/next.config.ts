import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep request paths exactly as written: Next's default trailing-slash
  // redirect (308) would strip the slash off /api/v1/... URLs before the
  // rewrites below match, breaking every DRF endpoint (they're all
  // slash-terminated) and looping through Django's APPEND_SLASH in prod.
  skipTrailingSlashRedirect: true,
  // Dev-server resources are host-restricted by default; allow LAN devices
  // (the demo TV / client device) to load them during development.
  allowedDevOrigins: ["192.168.1.138", "192.168.6.195"],
  // Same-origin API: the browser only ever talks to this origin, and we
  // proxy /api/v1/* and /media/* to the Django backend server-side (CORS
  // stays configured as a fallback only). API_PROXY_URL is the backend
  // address; unset falls back to the standard local dev server.
  async rewrites() {
    const backend = process.env.API_PROXY_URL || "http://127.0.0.1:8000";
    return [
      // Every DRF URL is slash-terminated, but the :path* matcher drops a
      // request's trailing slash - re-adding it in the destination keeps
      // Django from 301-looping (slash stripped -> APPEND_SLASH redirect ->
      // strip again). Media files need no slash handling.
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
