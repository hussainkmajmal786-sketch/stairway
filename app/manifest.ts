import type { MetadataRoute } from "next";
import { getSiteData } from "@/lib/site/load";

// Reads site settings from Supabase, so render per request rather than at build time.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { settings: event } = await getSiteData();
  return {
    name: `${event.name} — Weekend AI Series by ${event.organizer.short}`,
    short_name: event.name,
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
