import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { Stairway } from "@/components/sections/Stairway";
import { SOCIETY_FILL } from "@/lib/events/colors";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/s/[society]">): Promise<Metadata> {
  const { society } = await params;
  const s = (await getSiteData()).societies.find((x) => x.slug === society);
  if (!s) return {};
  return { title: `${s.shortName} stairway`, description: s.description, alternates: { canonical: `/s/${s.slug}` } };
}

export default async function SocietyPage({ params }: PageProps<"/s/[society]">) {
  const { society } = await params;
  const { societies } = await getSiteData();
  const s = societies.find((x) => x.slug === society);
  if (!s) notFound();
  return (
    <>
      <header className="pb-6 pt-12 md:pt-16">
        <div className="wrap">
          <nav aria-label="Breadcrumb" className="mono mb-6 font-bold text-ink-3">
            <Link href="/" className="underline-offset-4 hover:underline">Home</Link> <span aria-hidden>/</span>{" "}
            <Link href="/#societies" className="underline-offset-4 hover:underline">Societies</Link> <span aria-hidden>/</span>{" "}
            <span className="text-ink" aria-current="page">{s.shortName}</span>
          </nav>
          <span className={cn("inline-block border-2 border-ink px-3 py-1 font-mono font-bold shadow-[3px_3px_0_0_var(--ink)]", SOCIETY_FILL[s.color])}>{s.shortName}</span>
          <h1 className="mt-5 text-[clamp(2.6rem,7vw,5.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">{s.name}</h1>
          <p className="lead mt-5">{s.description}</p>
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tracks">
            {s.tracks.map((t) => <li key={t.id} className="tag tag-outline">{t.name}</li>)}
          </ul>
        </div>
      </header>
      <Stairway societySlug={s.slug} title={`The ${s.shortName} [[stairway.]]`} />
    </>
  );
}
