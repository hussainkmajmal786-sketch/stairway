import type { MetadataRoute } from "next";
import { event } from "@/data/event";

// generated once at build time (static export)
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${event.siteUrl}/sitemap.xml`,
    host: event.siteUrl,
  };
}
