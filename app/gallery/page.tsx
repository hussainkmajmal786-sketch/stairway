import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { Aftermovie, GalleryGrid } from "@/components/sections/Gallery";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photos and highlights from every st(AI)rway weekend at College of Engineering Kidangoor.",
  alternates: { canonical: "/gallery" },
};

export default function GalleryPage() {
  return (
    <>
      <PageHero eyebrow="Gallery" title="Every step, [[captured.]]" lead="Filter by weekend, click to open, use arrow keys or swipe to move between photos." />
      <div className="wrap pb-[var(--section-y)]">
        <Aftermovie />
        <div className="mt-12">
          <GalleryGrid />
        </div>
      </div>
    </>
  );
}
