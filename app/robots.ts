import type { MetadataRoute } from "next";
import { getSiteData } from "@/lib/site/load";

// Reads site settings from Supabase, so render per request rather than at build time.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { settings: event } = await getSiteData();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/me", "/onboarding", "/auth", "/login", "/u/"] },
    sitemap: `${event.siteUrl}/sitemap.xml`,
    host: event.siteUrl,
  };
}
