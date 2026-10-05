"use client";

import { useId, useState } from "react";
import { HelpCircle, Mail, Plus } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import type { FaqView as Faq } from "@/lib/site/types";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/utils";

function Item({ f, open, onToggle }: { f: Faq; open: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <div className={cn("border-2 border-ink transition-colors duration-150", open ? "bg-paper-2 shadow-[4px_4px_0_0_var(--ink)]" : "bg-paper")}>
      <h3>
        <button
          id={`${id}-btn`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
          className="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-4 text-left text-lg font-semibold"
        >
          <span>{f.q}</span>
          <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center border-2 border-ink transition-[transform,background] duration-200", open ? "rotate-45 bg-yellow" : "bg-paper")}>
            <Plus size={18} strokeWidth={2.5} />
          </span>
        </button>
      </h3>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-btn`}
        className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden" inert={!open}>
          <p className="border-t-2 border-ink px-5 py-4 text-ink-2">{f.a}</p>
        </div>
      </div>
    </div>
  );
}

export function FAQ() {
  const { settings: event, faqs } = useSiteData();
  const [open, setOpen] = useState<number | null>(0);
  const half = Math.ceil(faqs.length / 2);
  const cols = [faqs.slice(0, half), faqs.slice(half)];

  return (
    <section id="faq" aria-labelledby="faq-title" className="section section-alt">
      <div className="wrap">
        <SectionHeader id="faq-title" Icon={HelpCircle} eyebrow="FAQ" title="Questions before the [[first step?]]" />
        <div className="grid gap-4 lg:grid-cols-2">
          {cols.map((col, c) => (
            <div key={c} className="flex flex-col gap-4">
              {col.map((f, i) => {
                const idx = c * half + i;
                return (
                  <div key={f.q} data-reveal style={{ ["--d" as string]: i }}>
                    <Item f={f} open={open === idx} onToggle={() => setOpen(open === idx ? null : idx)} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center gap-4 text-center" data-reveal>
          <p className="text-ink-2">Still have questions?</p>
          <a href={`mailto:${event.contact.email}`} className="btn btn-ghost"><Mail size={16} strokeWidth={2} /> Contact the team</a>
        </div>
      </div>
    </section>
  );
}
