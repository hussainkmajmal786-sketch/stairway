import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is pre-rendered, so the site ships as plain static files in /out.
  // That lets it run on any static host — Cloudflare Pages, Vercel, Netlify, GitHub Pages.
  output: "export",
  // Static hosts have no image-optimisation server; images are served as-is.
  images: { unoptimized: true },
};

export default nextConfig;
