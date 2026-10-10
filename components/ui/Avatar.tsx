import Image from "next/image";
import { TOKENS } from "@/lib/design/tokens";
import { cn, hueFrom, initials } from "@/lib/utils";

// Flat block colours for generated monograms (ink text stays AA on all of them).
const FILLS = [TOKENS.yellow, TOKENS.blue, TOKENS.green, TOKENS.red, TOKENS.purple, TOKENS.orange, TOKENS.paper3];

/**
 * Portrait with graceful fallback: the real photo if `photo` is set,
 * otherwise a flat colour monogram tile, so layouts never look empty.
 */
export function Avatar({
  name, photo, size = 96, className, decorative = false, referrerPolicy,
}: {
  name: string; photo?: string; size?: number; className?: string;
  /** Hide from assistive tech when the name is already shown next to it. */
  decorative?: boolean;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
}) {
  if (photo)
    return (
      <Image
        src={photo} alt={decorative ? "" : name} width={size} height={size} referrerPolicy={referrerPolicy}
        className={cn("border-2 border-ink object-cover", className)} style={{ width: size, height: size }}
      />
    );
  return (
    <div
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
      className={cn("grid shrink-0 place-items-center border-2 border-ink", className)}
      style={{ width: size, height: size, background: FILLS[hueFrom(name) % FILLS.length] }}
    >
      <span className="font-mono font-bold text-ink" style={{ fontSize: Math.max(12, size * 0.32) }} aria-hidden>
        {initials(name)}
      </span>
    </div>
  );
}
