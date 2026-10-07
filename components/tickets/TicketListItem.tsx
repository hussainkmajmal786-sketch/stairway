import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { TicketListRow } from "@/lib/tickets/list";
import { cn } from "@/lib/utils";

const TONE = { green: "tag-green", yellow: "tag-yellow", orange: "tag-orange", outline: "tag-outline" } as const;

/** One My tickets row: the whole card links to the ticket. Built from a TicketListRow, so it can't hold a ticket code. */
export function TicketListItem({ row }: { row: TicketListRow }) {
  return (
    <Link
      href={row.href}
      className="box flex min-h-11 flex-wrap items-center justify-between gap-4 p-5 shadow-hard transition-colors hover:bg-paper-2"
    >
      <span className="min-w-0">
        <span className="mono block font-bold text-ink-3">
          {row.eyebrow} · {row.when}
        </span>
        <span className="mt-1 block break-words text-xl font-semibold">{row.title}</span>
        <span className="mt-1 block text-sm text-ink-2">{row.pass}</span>
      </span>
      <span className="flex flex-wrap items-center gap-3">
        <span className={cn("tag", TONE[row.status.tone])}>{row.status.label}</span>
        <span className="mono inline-flex items-center gap-1 font-bold">
          View ticket <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </span>
      </span>
    </Link>
  );
}
