import type { MetadataRoute } from "next";
import { getSiteData } from "@/lib/site/load";

// generated once at build time (static export)
export const dynamic = "force-static";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { settings: event } = await getSiteData();
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${event.siteUrl}/sitemap.xml`,
    host: event.siteUrl,
  };
}
