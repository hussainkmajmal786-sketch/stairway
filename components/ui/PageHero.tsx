import { Heading } from "./Heading";
import { FieldBand } from "./Poster";
import { GHOST_DEFAULT } from "@/lib/design/ghost";
import { displayTitleClass } from "@/lib/design/title";
import { cn } from "@/lib/utils";

/**
 * Compact poster header for inner pages: cobalt field, top corner band, ghost word (CLIMB unless the page passes
 * ghostWord(…) or false), extruded cream Anton title whose [[marked]] words turn yellow. Long titles step down a size
 * (displayTitleClass) rather than clipping. The reading area below stays cream.
 */
export function PageHero({ eyebrow, title, lead, ghost = GHOST_DEFAULT }: { eyebrow: string; title: string; lead?: string; ghost?: string | false }) {
  return (
    <FieldBand as="header" ghost={ghost} bands="top" className="mb-12 border-b-2 border-ink pb-12 pt-[clamp(72px,10vw,120px)] md:mb-16 md:pb-16">
      <div className="wrap">
        <p className="eyebrow mb-5" data-reveal>{eyebrow}</p>
        <Heading as="h1" text={title} tone="field" className={cn("h-display extrude max-w-[18ch] break-words pt-[0.14em]", displayTitleClass(title))} />
        {lead && <p className="lead mt-6" data-reveal>{lead}</p>}
      </div>
    </FieldBand>
  );
}
