import type { LucideIcon } from "lucide-react";
import { Heading } from "./Heading";
import { cn } from "@/lib/utils";

/** Mono eyebrow + Anton rule heading (+ lead). Use `tone="field"` inside a FieldBand (cream text, yellow marked words). */
export function SectionHeader({
  id,
  eyebrow,
  title,
  lead,
  Icon,
  align = "left",
  tone = "paper",
  rule = true,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  Icon?: LucideIcon;
  align?: "left" | "center";
  tone?: "paper" | "field";
  /** false drops the poster rules (use in half-width columns, where a wrapped title leaves a stray 12px dash) */
  rule?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("mb-10 md:mb-14", align === "center" && "mx-auto flex flex-col items-center text-center", className)}>
      <p className="eyebrow mb-4" data-reveal>
        {Icon && <Icon size={16} strokeWidth={2} aria-hidden />}
        {eyebrow}
      </p>
      <Heading id={id} text={title} tone={tone} rule={!rule ? undefined : align === "center" ? "both" : "left"} className={cn("h2", align === "center" && "w-full")} />
      {lead && (
        <p className={cn("lead mt-5", align === "center" && "mx-auto")} data-reveal style={{ ["--d" as string]: 2 }}>
          {lead}
        </p>
      )}
    </header>
  );
}
