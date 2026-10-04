import { ImageResponse } from "next/og";
import { weekends } from "@/data/weekends";
import { getWeekend, pad2 } from "@/lib/weekends";
import { OgFrame, ogSize } from "@/lib/og";

// generated once at build time (static export)
export const dynamic = "force-static";

export const alt = "st(AI)rway weekend";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return weekends.map((w) => ({ slug: w.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const w = getWeekend(slug)!;
  return new ImageResponse(
    <OgFrame
      eyebrow={`Step ${pad2(w.step)} of ${weekends.length}`}
      title={w.title}
      subtitle={w.topic}
      accent={w.track === "summit" ? "#FF5C38" : "#FFB200"}
    />,
    size,
  );
}
