import type { LucideIcon } from "lucide-react";
import { Heading } from "./Heading";
import { cn } from "@/lib/utils";

export function SectionHeader({
  id,
  eyebrow,
  title,
  lead,
  Icon,
  align = "left",
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  Icon?: LucideIcon;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <header className={cn("mb-10 md:mb-14", align === "center" && "mx-auto flex flex-col items-center text-center", className)}>
      <p className="eyebrow mb-4" data-reveal>
        {Icon && <Icon size={16} strokeWidth={2} aria-hidden />}
        {eyebrow}
      </p>
      <Heading id={id} text={title} className="h2 max-w-[20ch]" />
      {lead && (
        <p className={cn("lead mt-5", align === "center" && "mx-auto")} data-reveal style={{ ["--d" as string]: 2 }}>
          {lead}
        </p>
      )}
    </header>
  );
}
