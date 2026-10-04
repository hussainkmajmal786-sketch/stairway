import type { MetadataRoute } from "next";
import { event } from "@/data/event";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${event.siteUrl}/sitemap.xml`,
    host: event.siteUrl,
  };
}
