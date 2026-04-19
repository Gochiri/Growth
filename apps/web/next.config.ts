import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@growth/types"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
