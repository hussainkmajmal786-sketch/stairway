import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { ResourceHub } from "@/components/sections/Resources";

export const metadata: Metadata = {
  title: "Resources",
  description: "Slides, code, Colab notebooks and recordings from every st(AI)rway weekend.",
  alternates: { canonical: "/resources" },
};

export default function ResourcesPage() {
  return (
    <>
      <PageHero eyebrow="Resources hub" title="Everything from the steps [[behind you.]]" lead="Slides, code, notebooks and recordings — searchable by topic and level." />
      <div className="wrap pb-[var(--section-y)]">
        <ResourceHub showAll />
      </div>
    </>
  );
}
