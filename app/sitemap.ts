import type { MetadataRoute } from "next";
import { event } from "@/data/event";
import { weekends } from "@/data/weekends";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = event.siteUrl;
  const pages = ["", "/gallery", "/resources", "/register", "/code-of-conduct", "/privacy"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.6,
  }));
  const steps = weekends.map((w) => ({
    url: `${base}/weekend/${w.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  return [...pages, ...steps];
}
