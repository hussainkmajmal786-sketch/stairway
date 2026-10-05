import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { pad2 } from "@/lib/weekends";
import { WeekendDetail } from "@/components/weekend/WeekendDetail";
import { eventJsonLd, JsonLd } from "@/lib/jsonld";

const findEvent = async (slug: string) => {
  const data = await getSiteData();
  return { settings: data.settings, w: data.events.find((e) => e.slug === slug) };
};

export async function generateMetadata({ params }: PageProps<"/weekend/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { settings, w } = await findEvent(slug);
  if (!w) return {};
  const title = `Step ${pad2(w.step)}: ${w.title} — ${w.topic}`;
  return {
    title,
    description: w.summary,
    alternates: { canonical: `/weekend/${w.slug}` },
    openGraph: { title: `${title} | ${settings.name}`, description: w.summary, url: `/weekend/${w.slug}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} | ${settings.name}`, description: w.summary },
  };
}

export default async function WeekendPage({ params }: PageProps<"/weekend/[slug]">) {
  const { slug } = await params;
  const { settings, w } = await findEvent(slug);
  if (!w) notFound();
  return (
    <>
      <JsonLd data={eventJsonLd(w, settings)} />
      <WeekendDetail slug={slug} />
    </>
  );
}
