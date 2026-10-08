import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-server resources are host-restricted by default; allow LAN devices
  // (the demo TV / client device) to load them during development.
  allowedDevOrigins: ["192.168.1.138", "192.168.6.195"],
};

export default nextConfig;
