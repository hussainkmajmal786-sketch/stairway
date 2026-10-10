import { formatDate, pad2 } from "@/lib/weekends";

/** Accessible name of the top-bar next-step link; it contains the visible "Step NN" text (WCAG label-in-name). */
export function nextStepLabel(next: { step: number; title: string; start: string }): string {
  return `Next: Step ${pad2(next.step)}, ${next.title}, ${formatDate(next.start, { day: "numeric", month: "long" })}`;
}
