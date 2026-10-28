import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The chat used to live at /chat; keep old links working.
    return [{ source: "/chat", destination: "/", permanent: true }];
  },
};

export default nextConfig;
