import { qrPath } from "@/lib/tickets/qr";
import { QR_DARK, QR_LIGHT } from "@/lib/tickets/layout";
import { QUIET_ZONE, type TicketCardData, type TicketNotice } from "@/lib/tickets/view";

export type { TicketCardData };

function QrSvg({ rows, title }: { rows: string[]; title: string }) {
  const n = rows.length;
  const q = QUIET_ZONE;
  return (
    <svg
      viewBox={`${-q} ${-q} ${n + 2 * q} ${n + 2 * q}`}
      width={248}
      height={248}
      role="img"
      aria-label={`QR code ticket for ${title}`}
      shapeRendering="crispEdges"
      className="block h-auto w-full max-w-[248px] border-2 border-ink bg-white"
    >
      <rect x={-q} y={-q} width={n + 2 * q} height={n + 2 * q} fill={QR_LIGHT} />
      <path d={qrPath(rows)} fill={QR_DARK} />
    </svg>
  );
}

const panel = "border-2 border-ink bg-paper-2 p-5 text-center";

/** Every non-confirmed state: never a QR, code or token. */
function NoticeBlock({ notice }: { notice: TicketNotice }) {
  switch (notice.kind) {
    case "none":
      return null;
    case "waitlisted":
      return (
        <div className={panel}>
          <p className="mono">You&apos;re on the waitlist</p>
          {notice.position != null && (
            <p className="mt-2 font-display text-5xl tabular">
              <span className="sr-only">Position </span>#{notice.position}
            </p>
          )}
          <p className="mt-2 text-sm text-ink-2">
            This is not an entry ticket yet.{" "}
            {notice.paid
              ? "If a seat frees up you get 15 minutes to pay, and this page becomes your ticket."
              : "If a seat frees up you move up automatically, and this page becomes your ticket."}{" "}
            We don&apos;t send emails yet, so check back here.
          </p>
        </div>
      );
    case "pay":
      return (
        <div className={panel}>
          <p className="mono">Payment pending</p>
          <p className="mt-2 text-sm text-ink-2">Your seat is held for 15 minutes. This is not an entry ticket until the payment is confirmed.</p>
        </div>
      );
    case "processing":
      return (
        <div className={panel}>
          <p className="mono">Confirming your payment</p>
          <p className="mt-2 text-sm text-ink-2">This usually takes a few seconds. This is not an entry ticket until it is confirmed.</p>
        </div>
      );
    case "hold_expired":
      return (
        <div className={panel}>
          <p className="mono">Seat hold expired</p>
          <p className="mt-2 text-sm text-ink-2">
            The 15 minutes ran out before a payment arrived, so the seat was released. If money left your account it is
            not lost: it is confirmed here if a seat is free, or refunded.
          </p>
        </div>
      );
    case "refund_needed":
      return (
        <div className={panel}>
          <p className="mono">Refund pending</p>
          <p className="mt-2 text-sm text-ink-2">
            {notice.latePayment
              ? `Your payment arrived after the seat was released, so ${notice.amount} will be refunded to your original payment method.`
              : `You cancelled this paid seat. The organisers will refund ${notice.amount} to your original payment method.`}{" "}
            Refunds are not automatic and can take a few days.
          </p>
        </div>
      );
    case "refunded":
      return (
        <div className={panel}>
          <p className="mono">Refunded</p>
          <p className="mt-2 text-sm text-ink-2">
            {notice.amount} was refunded{notice.refundedOn ? ` on ${notice.refundedOn}` : ""}. Banks can take 5–7 working days to show it.
          </p>
        </div>
      );
    case "cancelled":
      return (
        <div className={panel}>
          <p className="mono">Registration cancelled</p>
          <p className="mt-2 text-sm text-ink-2">This registration is no longer active.</p>
        </div>
      );
  }
}

/**
 * The ticket itself (server-rendered): cobalt header with the cream wordmark and diagonal band, a perforation, then
 * the door pass on cream. The QR encodes only the opaque ticket code (no personal data) and is always black on white.
 */
export function TicketCard({ t }: { t: TicketCardData }) {
  // Defence in depth: whatever the caller passes, only a confirmed seat ever shows a QR, code or token.
  const confirmed = t.status === "confirmed";
  return (
    <article className="box mx-auto w-full max-w-md shadow-[6px_6px_0_0_var(--ink)]" aria-labelledby="ticket-title">
      <header className="ticket-h">
        <span aria-hidden="true" className="relative z-[1] font-sans text-[1.35rem] font-semibold tracking-[-0.04em]">
          st<span className="mx-[0.04em] bg-yellow px-[0.08em] text-ink">(AI)</span>rway
        </span>
        <span aria-hidden="true" className="mono relative z-[1] mr-14 font-bold">Ticket</span>
        <span className="sr-only">st(AI)rway ticket</span>
      </header>
      <div className="grid gap-5 p-5">
        <div>
          <p className="mono font-bold text-ink-3">{t.eyebrow}</p>
          <h2 id="ticket-title" className="mt-1 break-words text-2xl font-semibold">{t.title}</h2>
        </div>
        <dl className="grid gap-2 text-sm">
          <div><dt className="mono text-ink-3">When</dt><dd>{t.when}</dd></div>
          <div><dt className="mono text-ink-3">Where</dt><dd>{t.venue}</dd></div>
          <div><dt className="mono text-ink-3">Name</dt><dd className="break-words font-semibold">{t.name}</dd></div>
          {t.receipt && (
            <div><dt className="mono text-ink-3">Receipt</dt><dd className="tabular">{t.receipt.number} · {t.receipt.amount} paid</dd></div>
          )}
        </dl>
      </div>
      <div className="perf" aria-hidden="true" />
      <div className="grid gap-5 p-5">
        {confirmed && t.pass.kind === "qr" && t.qrRows ? (
          <figure className="grid justify-items-center gap-2">
            <QrSvg rows={t.qrRows} title={t.title} />
            <figcaption className="grid justify-items-center gap-1 text-center">
              <span className="mono text-ink-3">Show this code at the door{t.token ? ` · ${t.token}` : ""}</span>
              {t.code && (
                <span className="font-mono text-xs break-all text-ink-2">
                  <span className="sr-only">Ticket code, if the scanner can&apos;t read the QR: </span>
                  {t.code}
                </span>
              )}
            </figcaption>
          </figure>
        ) : confirmed && t.pass.kind === "token" ? (
          <div className="border-2 border-ink bg-white p-5 text-center">
            <p className="mono text-ink-3">Your token</p>
            {/* Sized to keep a typical token (RAS-01-0042) on one line down to 320px; break-all is only the safety net. */}
            <p className="mt-2 break-all font-mono text-[clamp(1.5rem,7.5vw,2.25rem)] font-bold tabular">{t.pass.token}</p>
            <p className="mt-2 text-sm text-ink-2">Say or show this token at the door.</p>
          </div>
        ) : (
          <NoticeBlock notice={t.notice} />
        )}
        {t.checkedInAt && <p className="tag tag-green justify-self-start">Checked in</p>}
      </div>
    </article>
  );
}
