import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Cloudflare Workers has no image-optimisation server here; images are served as-is.
  images: { unoptimized: true },
  async redirects() {
    return [{ source: "/weekend/:slug", destination: "/events/:slug", permanent: true }];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
