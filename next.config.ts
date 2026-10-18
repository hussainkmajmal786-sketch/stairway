import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Cloudflare Workers has no image-optimisation server here; images are served as-is.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/invite/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/weekend/:slug", destination: "/events/:slug", permanent: true }];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
