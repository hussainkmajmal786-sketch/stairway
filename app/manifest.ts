import type { MetadataRoute } from "next";
import { getSiteData } from "@/lib/site/load";

// generated once at build time (static export)
export const dynamic = "force-static";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { settings: event } = await getSiteData();
  return {
    name: "st(AI)rway — Weekend AI Series by IEEE SB CEK",
    short_name: "st(AI)rway",
    description: event.description,
    start_url: "/",
    display: "standalone",
    background_color: "#F4EFE6",
    theme_color: "#F4EFE6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
