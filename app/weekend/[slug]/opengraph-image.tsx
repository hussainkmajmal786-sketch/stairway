import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { pad2 } from "@/lib/weekends";
import { OgFrame, ogSize } from "@/lib/og";

export const alt = "st(AI)rway weekend";
export const size = ogSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { events } = await getSiteData();
  const w = events.find((e) => e.slug === slug);
  if (!w) notFound();
  const stairwayLength = events.filter((e) => e.society.slug === w.society.slug).length;
  return new ImageResponse(
    <OgFrame
      eyebrow={`Step ${pad2(w.step)} of ${stairwayLength}`}
      title={w.title}
      subtitle={w.topic}
      accent={w.isFinale ? "#FF5C38" : "#FFB200"}
    />,
    size,
  );
}
