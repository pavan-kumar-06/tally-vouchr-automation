import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vouchr/db", "@vouchr/contracts"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**"
      }
    ]
  }
};

export default nextConfig;
