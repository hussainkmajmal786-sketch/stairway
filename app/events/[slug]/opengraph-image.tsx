import { ImageResponse } from "next/og";
import { getSiteData } from "@/lib/site/load";
import { pad2 } from "@/lib/weekends";
import { OG_HOME, OgFrame, ogAccent, ogFontText, ogSize, ogTitle } from "@/lib/og";
import { ogFonts } from "@/lib/og-font";

export const alt = "st(AI)rway session";
export const size = ogSize;
export const contentType = "image/png";

/**
 * Public data only: getSiteData() returns published events, and the card shows society, step, title and topic.
 * An unknown slug gets the generic home card (stair wordmark), never an error.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { events } = await getSiteData();
  const ev = events.find((e) => e.slug === slug);
  const card = ev
    ? { eyebrow: `${ev.society.shortName} · Step ${pad2(ev.step)}`, title: ogTitle(ev.title), subtitle: ogTitle(ev.topic ?? "", 60) }
    : { ...OG_HOME, title: null };
  const fonts = await ogFonts(ogFontText(card));
  return new ImageResponse(<OgFrame {...card} accent={ogAccent(!!ev?.isFinale)} />, {
    ...size,
    fonts,
    // Crawlers re-fetch rarely; let the edge keep a styled card for an hour, but retry a font fallback soon.
    headers: { "Cache-Control": fonts ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" : "public, max-age=60" },
  });
}
