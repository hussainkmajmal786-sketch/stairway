import { ImageResponse } from "next/og";
import { getSiteData } from "@/lib/site/load";
import { pad2 } from "@/lib/weekends";
import { OgFrame, ogSize } from "@/lib/og";

export const alt = "st(AI)rway session";
export const size = ogSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { events } = await getSiteData();
  const ev = events.find((e) => e.slug === slug);
  return new ImageResponse(
    <OgFrame
      eyebrow={ev ? `${ev.society.shortName} · Step ${pad2(ev.step)}` : "st(AI)rway"}
      title={ev?.title ?? "Session"}
      subtitle={ev?.topic ?? ""}
      accent={ev?.isFinale ? "#FF5C38" : "#FFB200"}
    />,
    size,
  );
}
