import Image from "next/image";
import { cn, hueFrom, initials } from "@/lib/utils";

// Flat block colours for generated monograms (ink text stays AA on all of them).
const FILLS = ["#FFB200", "#2A8CFF", "#1BE349", "#FF5A5A", "#C07CFF", "#FF5C38", "#E2D8C8"];

/**
 * Portrait with graceful fallback: the real photo if `photo` is set,
 * otherwise a flat colour monogram tile, so layouts never look empty.
 */
export function Avatar({ name, photo, size = 96, className }: { name: string; photo?: string; size?: number; className?: string }) {
  if (photo)
    return (
      <Image src={photo} alt={name} width={size} height={size} className={cn("border-2 border-ink object-cover", className)} style={{ width: size, height: size }} />
    );
  return (
    <div
      role="img"
      aria-label={name}
      className={cn("grid shrink-0 place-items-center border-2 border-ink", className)}
      style={{ width: size, height: size, background: FILLS[hueFrom(name) % FILLS.length] }}
    >
      <span className="font-mono font-bold text-ink" style={{ fontSize: Math.max(12, size * 0.32) }} aria-hidden>
        {initials(name)}
      </span>
    </div>
  );
}
