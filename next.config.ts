import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  serverExternalPackages: ["ioredis", "bullmq"],
};

export default nextConfig;
