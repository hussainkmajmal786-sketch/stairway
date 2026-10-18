"use client";

import { AlertTriangle, CheckCircle2, ShieldQuestion, XCircle } from "lucide-react";
import type { Presented } from "@/lib/admin/scan";
import type { CheckInResult } from "@/lib/admin/registration-actions";
import { formatToken } from "@/lib/tickets/token";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

const TONE = {
  success: { Icon: CheckCircle2, bg: "bg-green" },
  warn: { Icon: AlertTriangle, bg: "bg-yellow" },
  error: { Icon: XCircle, bg: "bg-red" },
  confirm: { Icon: ShieldQuestion, bg: "bg-paper" },
} as const;

/**
 * Full-width result: icon + word + colour. role="status" with assertive announcements so a volunteer using a screen
 * reader hears an "Already checked in" warning immediately.
 */
export function ScanResultPanel({
  presented,
  attendee,
  pending,
  onNext,
  onConfirm,
}: {
  presented: Presented;
  attendee?: CheckInResult["attendee"];
  pending: boolean;
  onNext: () => void;
  onConfirm?: () => void;
}) {
  const { Icon, bg } = TONE[presented.tone];
  const token = attendee && attendee.token_number !== null ? formatToken(attendee.token_prefix, attendee.token_number) : "";
  return (
    <section
      role="status"
      aria-live="assertive"
      className={cn("box shadow-hard grid min-h-[30vh] content-center gap-4 border-ink p-5 text-ink", bg)}
    >
      <div className="flex items-center gap-3">
        <Icon size={40} strokeWidth={2.25} aria-hidden />
        <h2 className="text-2xl font-semibold leading-tight">{presented.title}</h2>
      </div>
      {attendee && (
        <div className="flex items-center gap-4">
          <Avatar name={attendee.full_name || "Attendee"} photo={attendee.avatar_url ?? undefined} size={72} decorative referrerPolicy="no-referrer" />
          <div className="min-w-0">
            <p className="break-words text-xl font-semibold">{attendee.full_name}</p>
            <p className="break-words">{attendee.college}</p>
            {token && <p className="mono font-bold">{token}</p>}
          </div>
        </div>
      )}
      <p className="text-lg">{presented.detail}</p>
      <div className="flex flex-wrap gap-3">
        {presented.tone === "confirm" && onConfirm ? (
          <>
            <button type="button" className="btn btn-primary min-h-12" disabled={pending} onClick={onConfirm}>
              {pending ? "Checking in…" : "It's them — check in"}
            </button>
            <button type="button" className="btn btn-secondary min-h-12" disabled={pending} onClick={onNext}>
              Not them
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ink min-h-12" onClick={onNext} autoFocus>
            Next
          </button>
        )}
      </div>
    </section>
  );
}
