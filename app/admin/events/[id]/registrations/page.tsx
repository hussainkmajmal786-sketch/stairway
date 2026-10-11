import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ScanLine } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  answerText, parsePage, parseRegistrantsPage, parseSearch, parseStatusFilter, REGISTRATION_STATUSES, STATUS_LABEL,
} from "@/lib/admin/registrants";
import { paymentsConfig } from "@/lib/payments/config";
import { formatInr } from "@/lib/payments/money";
import { QuestionsSchema } from "@/lib/registration/questions";
import { formatToken } from "@/lib/tickets/token";
import { formatDate } from "@/lib/weekends";
import { PromoteWaitlist } from "@/components/admin/PromoteWaitlist";
import type { RegistrantView } from "@/components/admin/RegistrantRow";
import { RegistrantsTable } from "@/components/admin/RegistrantsTable";

const PAGE_SIZE = 100;
const when = (iso: string) =>
  formatDate(iso, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const path = `/admin/events/${id}/registrations`;
  // The society comes from the event row; anything the admin does not manage is a 404.
  const { ctx, db } = await requireAdmin(path, { kind: "event", eventId: id });
  const sp = await searchParams;
  const status = parseStatusFilter(one(sp.status));
  const q = parseSearch(one(sp.q));
  const page = parsePage(one(sp.page));

  const { data: ev } = await db
    .from("events")
    .select("title, slug, status, capacity, token_prefix, questions")
    .eq("id", id)
    .maybeSingle();
  if (!ev) notFound();

  const [regs, all, seats] = await Promise.all([
    db.rpc("admin_event_registrants", {
      p_event_id: id,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
      ...(status ? { p_status: status } : {}),
      ...(q ? { p_q: q } : {}),
    }),
    db.from("registrations").select("status").eq("event_id", id).limit(5000),
    db.from("event_seat_counts").select("attending, waitlisted").eq("event_id", id).maybeSingle(),
  ]);
  const data = parseRegistrantsPage(regs.data);
  if (regs.error || !data) notFound();

  // Refund controls: super admins only, inert (with the reason) unless payments are on in the env AND the database.
  let refundReason = "";
  if (ctx.isSuper) {
    if (!paymentsConfig().enabled) refundReason = "Payments are switched off, so refunds are disabled.";
    else {
      const flag = await db.rpc("admin_payments_flag");
      if (flag.error || flag.data !== true) refundReason = "Payments are switched off, so refunds are disabled.";
    }
  }

  const counts = new Map<string, number>();
  for (const r of all.data ?? []) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const attending = seats.data?.attending ?? 0;
  const waitlisted = seats.data?.waitlisted ?? 0;
  const freeSeats = Math.max(ev.capacity - attending, 0);

  const parsedQuestions = QuestionsSchema.safeParse(ev.questions ?? []);
  const questions = parsedQuestions.success ? parsedQuestions.data : [];

  const rows: RegistrantView[] = data.rows.map((r) => {
    const a = r.answers && typeof r.answers === "object" ? (r.answers as Record<string, unknown>) : {};
    const hasPayment = Boolean(r.razorpay_payment_id);
    const live = r.status === "confirmed" || r.status === "waitlisted" || r.status === "pending_payment";
    return {
      id: r.registration_id,
      token: typeof r.token_number === "number" ? formatToken(ev.token_prefix ?? "", r.token_number) : "",
      name: r.full_name ?? "",
      handle: r.handle ?? "",
      college: r.college ?? "",
      status: r.status,
      checkedInLabel: r.checked_in_at ? when(r.checked_in_at) : null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      branchYear: [r.branch, r.year].filter(Boolean).join(" / "),
      answers: questions.map((qq) => ({ label: qq.label, value: answerText(a[qq.id]) })).filter((x) => x.value !== ""),
      receipt: r.receipt_number ?? null,
      paymentId: ctx.isSuper ? (r.razorpay_payment_id ?? null) : null,
      amountLabel: typeof r.amount_paise === "number" && r.amount_paise > 0 ? formatInr(r.amount_paise) : null,
      registeredLabel: when(r.created_at),
      waitlistPosition: r.waitlist_position ?? null,
      canCheckIn: r.status === "confirmed" && !r.checked_in_at,
      canUndo: r.status === "confirmed" && Boolean(r.checked_in_at),
      canCancel: live && !r.checked_in_at,
      refund:
        ctx.isSuper && hasPayment && (r.status === "confirmed" || r.status === "refund_needed")
          ? refundReason === "" ? "enabled" : "disabled"
          : "none",
      refundReason,
    };
  });

  const link = (p: { status?: string | null; page?: number }) => {
    const u = new URLSearchParams();
    const s = p.status === undefined ? status : p.status;
    if (s) u.set("status", s);
    if (q) u.set("q", q);
    if ((p.page ?? 1) > 1) u.set("page", String(p.page));
    const qs = u.toString();
    return `${path}${qs ? `?${qs}` : ""}`;
  };
  const exportHref = `/admin/events/${id}/export`;
  const hasNext = (page - 1) * PAGE_SIZE + PAGE_SIZE < data.total;

  return (
    <div className="grid gap-6">
      <header>
        <Link href={`/admin/events/${id}`} className="mono inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          Back to session
        </Link>
        <h1 className="mt-2 break-words text-3xl font-semibold md:text-4xl">Registrations</h1>
        <p className="mt-1 break-words text-ink-3">{ev.title}</p>
        <p className="mt-4 flex flex-wrap gap-3">
          {ev.status === "published" && (
            <Link href={`/admin/events/${id}/check-in`} className="btn btn-primary btn-sm">
              <ScanLine size={16} aria-hidden /> Open scanner
            </Link>
          )}
          <a href={exportHref} className="btn btn-secondary btn-sm">
            <Download size={16} aria-hidden /> Export CSV
          </a>
          <a href={`${exportHref}?answers=1`} className="btn btn-secondary btn-sm">
            <Download size={16} aria-hidden /> Export with answers
          </a>
        </p>
        <p className="mt-2 text-sm text-ink-3">
          The export contains names, emails and phone numbers: handle with care. It holds up to 2,000 rows.
        </p>
      </header>

      <div className="box p-4">
        <PromoteWaitlist eventId={id} freeSeats={freeSeats} waitlisted={waitlisted} />
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        <Link
          href={link({ status: null })}
          aria-current={status === null ? "page" : undefined}
          className={`btn btn-sm ${status === null ? "btn-primary" : "btn-secondary"}`}
        >
          All ({all.data?.length ?? 0})
        </Link>
        {REGISTRATION_STATUSES.map((s) => (
          <Link
            key={s}
            href={link({ status: s })}
            aria-current={status === s ? "page" : undefined}
            className={`btn btn-sm ${status === s ? "btn-primary" : "btn-secondary"}`}
          >
            {STATUS_LABEL[s]} ({counts.get(s) ?? 0})
          </Link>
        ))}
      </nav>

      <form method="get" action={path} className="flex flex-wrap gap-2" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="reg-q" className="sr-only">
          Search by name, handle or token number
        </label>
        <input
          id="reg-q"
          name="q"
          defaultValue={q ?? ""}
          maxLength={80}
          placeholder="Name, handle or token number"
          className="h-12 min-w-0 flex-1 border-2 border-ink bg-white px-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-field"
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      <p aria-live="polite" className="text-sm text-ink-3">
        {data.total} {data.total === 1 ? "registration" : "registrations"}
        {status ? ` with status ${STATUS_LABEL[status].toLowerCase()}` : ""}
        {q ? ` matching "${q}"` : ""}.
      </p>

      <RegistrantsTable eventId={id} rows={rows} />

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="flex gap-3">
          {page > 1 && (
            <Link href={link({ page: page - 1 })} className="btn btn-secondary btn-sm">
              Previous
            </Link>
          )}
          {hasNext && (
            <Link href={link({ page: page + 1 })} className="btn btn-secondary btn-sm">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
