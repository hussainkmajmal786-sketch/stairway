"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import type { GalleryItemView as GalleryItem } from "@/lib/site/types";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GalleryArt } from "@/components/ui/GalleryArt";
import { Modal } from "@/components/ui/Modal";
import { pad2 } from "@/lib/weekends";
import { cn } from "@/lib/utils";

const ratioCls = { tall: "aspect-[3/4]", wide: "aspect-[4/3]", square: "aspect-square" };

function Lightbox({ items, index, onClose, setIndex }: { items: GalleryItem[]; index: number | null; onClose: () => void; setIndex: (i: number) => void }) {
  const touch = useRef<number | null>(null);
  const go = useCallback((d: number) => index !== null && setIndex((index + d + items.length) % items.length), [index, items.length, setIndex]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [index, go]);

  const item = index !== null ? items[index] : null;
  return (
    <Modal open={index !== null} onClose={onClose} label="Photo viewer" className="max-w-5xl !p-4 sm:!p-6">
      {item && (
        <figure
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            touch.current = null;
          }}
        >
          <div className="relative mt-14 aspect-[16/10] overflow-hidden border-2 border-ink">
            <GalleryArt key={item.id} item={item} sizes="90vw" />
          </div>
          <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span>
              {item.step !== null && <span className="tag tag-yellow">Step {pad2(item.step)}</span>}
              <span className="mt-1 block">{item.caption}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold">{index! + 1} / {items.length}</span>
              <button onClick={() => go(-1)} className="grid h-11 w-11 place-items-center border-2 border-ink bg-paper-2 hover:bg-yellow" aria-label="Previous photo">
                <ChevronLeft size={20} strokeWidth={2} />
              </button>
              <button onClick={() => go(1)} className="grid h-11 w-11 place-items-center border-2 border-ink bg-paper-2 hover:bg-yellow" aria-label="Next photo">
                <ChevronRight size={20} strokeWidth={2} />
              </button>
            </span>
          </figcaption>
        </figure>
      )}
    </Modal>
  );
}

export function GalleryGrid({ limit }: { limit?: number }) {
  const { gallery } = useSiteData();
  const chips = [...new Map(gallery.filter((g) => g.eventSlug).map((g) => [g.eventSlug!, g.eventTitle!])).entries()];
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<number | null>(null);
  const items = gallery.filter((g) => filter === "all" || g.eventSlug === filter).slice(0, limit);

  return (
    <>
      <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter photos by weekend">
        <button className="chip-btn" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
        {chips.map(([slug, title]) => (
          <button key={slug} className="chip-btn" aria-pressed={filter === slug} onClick={() => setFilter(slug)}>
            {title}
          </button>
        ))}
      </div>
      <ul className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>li]:mb-5">
        {items.map((g, i) => (
          <li key={`${filter}-${g.id}`} className="break-inside-avoid" data-reveal style={{ ["--d" as string]: i % 3 }}>
            <button
              onClick={() => setOpen(i)}
              className="lift block w-full border-2 border-ink bg-paper p-2 text-left shadow-hard"
              aria-label={`Open photo: ${g.caption}`}
            >
              <span className={cn("relative block overflow-hidden border-2 border-ink", ratioCls[g.ratio])}>
                <GalleryArt item={g} />
              </span>
              <span className="block px-1 pb-1 pt-2 text-sm font-medium">{g.caption}</span>
            </button>
          </li>
        ))}
      </ul>
      <Lightbox items={items} index={open} onClose={() => setOpen(null)} setIndex={setOpen} />
    </>
  );
}

export function Aftermovie() {
  const { settings: event } = useSiteData();
  const [play, setPlay] = useState(false);
  return (
    <div className="relative aspect-video overflow-hidden border-2 border-ink shadow-[6px_6px_0_0_var(--ink)]" data-reveal>
      {play ? (
        <iframe src={`${event.aftermovieUrl}?autoplay=1`} title="st(AI)rway aftermovie" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
      ) : (
        <button onClick={() => setPlay(true)} className="group absolute inset-0 grid place-items-center" aria-label="Play the st(AI)rway aftermovie">
          <GalleryArt item={{ id: "after", eventSlug: null, eventTitle: null, step: 1, caption: "", alt: "", ratio: "wide" }} />
          <span className="relative grid h-20 w-20 place-items-center border-2 border-ink bg-yellow shadow-[4px_4px_0_0_var(--ink)] transition-transform duration-150 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5">
            <Play size={30} strokeWidth={2} fill="currentColor" aria-hidden />
          </span>
          <span className="absolute bottom-4 left-4 border-2 border-ink bg-paper px-4 py-3 text-left">
            <span className="mono block font-bold">Aftermovie</span>
            <span className="block text-xl font-semibold md:text-2xl">Steps 01–03 in 90 seconds</span>
          </span>
        </button>
      )}
    </div>
  );
}

export function Gallery() {
  return (
    <section id="gallery" aria-labelledby="gallery-title" className="section">
      <div className="wrap">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeader id="gallery-title" Icon={Camera} eyebrow="Gallery & highlights" title="Proof of the [[climb.]]" className="!mb-0" />
          <Link href="/gallery" className="btn btn-secondary shrink-0" data-reveal>
            Full gallery <ArrowRight size={16} strokeWidth={2} />
          </Link>
        </div>
        <div className="mt-10"><Aftermovie /></div>
        <div className="mt-12"><GalleryGrid limit={6} /></div>
      </div>
    </section>
  );
}
