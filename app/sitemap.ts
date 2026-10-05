import type { MetadataRoute } from "next";
import { getSiteData } from "@/lib/site/load";

// generated once at build time (static export)
export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { settings, societies, events } = await getSiteData();
  const base = settings.siteUrl;
  const pages = ["", "/gallery", "/resources", "/register", "/code-of-conduct", "/privacy"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.6,
  }));
  const socs = societies.map((s) => ({
    url: `${base}/s/${s.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  const steps = events.map((w) => ({
    url: `${base}/events/${w.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  return [...pages, ...socs, ...steps];
}
