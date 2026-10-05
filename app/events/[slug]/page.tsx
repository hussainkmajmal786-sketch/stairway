import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { pad2 } from "@/lib/weekends";
import { WeekendDetail } from "@/components/weekend/WeekendDetail";
import { eventJsonLd, JsonLd } from "@/lib/jsonld";

const findEvent = async (slug: string) => {
  const data = await getSiteData();
  return { data, ev: data.events.find((e) => e.slug === slug) };
};

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data, ev } = await findEvent(slug);
  if (!ev) return {};
  const title = `${ev.society.shortName} Step ${pad2(ev.step)}: ${ev.title} — ${ev.topic}`;
  return {
    title,
    description: ev.summary,
    alternates: { canonical: `/events/${ev.slug}` },
    openGraph: { title: `${title} | ${data.settings.name}`, description: ev.summary, url: `/events/${ev.slug}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} | ${data.settings.name}`, description: ev.summary },
  };
}

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const { data, ev } = await findEvent(slug);
  if (!ev) notFound();
  return (
    <>
      <JsonLd data={eventJsonLd(ev, data.settings)} />
      <WeekendDetail slug={slug} />
    </>
  );
}
