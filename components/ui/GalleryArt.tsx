import Image from "next/image";
import type { GalleryItemView as GalleryItem } from "@/lib/site/types";
import { TOKENS } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

const FILLS = [TOKENS.yellow, TOKENS.blue, TOKENS.green, TOKENS.red, TOKENS.purple, TOKENS.orange];

/** Real photo when `src` is set; otherwise a flat "poster" placeholder in the house style. */
export function GalleryArt({ item, className, sizes = "(max-width: 768px) 100vw, 33vw" }: { item: GalleryItem; className?: string; sizes?: string }) {
  if (item.src) return <Image src={item.src} alt={item.alt} fill sizes={sizes} className={cn("object-cover", className)} />;
  const seed = [...item.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const fill = FILLS[seed % FILLS.length];
  return (
    <div role="img" aria-label={item.alt} className={cn("absolute inset-0 overflow-hidden bg-paper-2", className)}>
      {/* stepped blocks — a stairway poster */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <rect key={i} x={8 + i * 17} y={78 - i * 15} width="17" height={22 + i * 15} fill={i === 4 ? fill : TOKENS.paper2} stroke={TOKENS.ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <span className="absolute left-3 top-3 border-2 border-ink bg-paper px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]">
        {`Photo · Step ${String(item.step ?? 0).padStart(2, "0")}`}
      </span>
    </div>
  );
}
