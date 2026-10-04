import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { weekends } from "@/data/weekends";
import { getWeekend, pad2 } from "@/lib/weekends";
import { WeekendDetail } from "@/components/weekend/WeekendDetail";
import { eventJsonLd, JsonLd } from "@/lib/jsonld";

export const dynamicParams = false;

export function generateStaticParams() {
  return weekends.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({ params }: PageProps<"/weekend/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const w = getWeekend(slug);
  if (!w) return {};
  const title = `Step ${pad2(w.step)}: ${w.title} — ${w.topic}`;
  return {
    title,
    description: w.summary,
    alternates: { canonical: `/weekend/${w.slug}` },
    openGraph: { title: `${title} | st(AI)rway`, description: w.summary, url: `/weekend/${w.slug}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} | st(AI)rway`, description: w.summary },
  };
}

export default async function WeekendPage({ params }: PageProps<"/weekend/[slug]">) {
  const { slug } = await params;
  const w = getWeekend(slug);
  if (!w) notFound();
  return (
    <>
      <JsonLd data={eventJsonLd(w)} />
      <WeekendDetail slug={slug} />
    </>
  );
}
