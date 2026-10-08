import { cn } from "@/lib/utils";
import { padStep } from "@/lib/design/ghost";

/**
 * Card step number: Anton digits (cobalt with a mini ink extrusion, or plain ink on colour fills) after three rising
 * ink bars. Size with `[--stepnum-size:…]` in className. The bars are decorative; the digits are read.
 */
export function StepNumber({ n, tone = "field", className }: { n: number; tone?: "field" | "ink"; className?: string }) {
  return (
    <span className={cn("stepnum", tone === "ink" && "stepnum-ink", className)}>
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      <b>{padStep(n)}</b>
    </span>
  );
}
