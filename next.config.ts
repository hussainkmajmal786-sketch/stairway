import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Content now loads from Supabase at request time, so the site is no longer a
  // static export. Task 8 finalises the Cloudflare deployment config.
  // Images are still served as-is (no image-optimisation server on the host).
  images: { unoptimized: true },
};

export default nextConfig;
