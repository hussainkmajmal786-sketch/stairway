"use client";

import { useState } from "react";
import { CalendarPlus, Download, Loader2 } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { ShareButtons } from "@/components/ui/ShareButtons";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar";
import { downloadBlob, ticketPngBlob, type TicketPngData } from "@/lib/tickets/png";
import type { EventView } from "@/lib/events/types";

/**
 * Download PNG (confirmed tickets only), add to calendar, and share the public session page. Shared links and text
 * never contain the ticket code or the registration id: the code is a bearer secret for the door.
 */
export function TicketActions({
  ev, png, filename, shareText, upcoming,
}: {
  ev: EventView | null;
  png: TicketPngData | null;
  filename: string;
  shareText: string;
  /** The session hasn't ended: calendar and "bring a friend" only make sense before then. */
  upcoming: boolean;
}) {
  const { settings } = useSiteData();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function download() {
    if (!png || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      downloadBlob(await ticketPngBlob(png), filename);
      setMsg({ ok: true, text: "Ticket image saved." });
    } catch {
      setMsg({ ok: false, text: "Couldn't create the image. Take a screenshot of the ticket instead." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      {png && (
        <div>
          <button type="button" className="btn btn-primary w-full" onClick={download} disabled={busy} aria-busy={busy}>
            {busy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Download size={16} strokeWidth={2} aria-hidden />
            )}
            Download ticket (PNG)
          </button>
          <p
            role="status"
            aria-live="polite"
            className={msg?.ok ? "mt-2 text-sm font-semibold text-green-ink" : "mt-2 text-sm font-semibold text-red-ink"}
          >
            {msg?.text}
          </p>
        </div>
      )}
      {ev && upcoming && (
        <div>
          <p className="mono mb-3 font-bold">Add to calendar</p>
          <div className="grid grid-cols-2 gap-3">
            <a
              href={googleCalendarUrl(ev, settings)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-secondary !px-2"
            >
              <CalendarPlus size={16} strokeWidth={2} aria-hidden /> Google
              <span className="sr-only">Calendar (opens in a new tab)</span>
            </a>
            <button type="button" onClick={() => downloadIcs(ev, settings)} className="btn btn-sm btn-secondary !px-2">
              <Download size={16} strokeWidth={2} aria-hidden /> .ics<span className="sr-only"> calendar file</span>
            </button>
          </div>
        </div>
      )}
      {ev && upcoming && (
        <div>
          <p className="mono mb-3 font-bold">Bring a friend</p>
          <ShareButtons path={`/events/${encodeURIComponent(ev.slug)}`} text={shareText} />
        </div>
      )}
    </div>
  );
}
