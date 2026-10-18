import Link from "next/link";
import { Clock, Info, ShieldAlert } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { PENDING_COPY, REJECT_COPY, formatDateIST, renewalState, type MembershipView } from "@/lib/community/membership";
import { ClaimForm } from "./ClaimForm";

const Section = ({ title, children, tone = "box" }: { title: string; children: React.ReactNode; tone?: "box" | "box-2" }) => (
  <section className={`${tone} grid gap-4 p-5 shadow-hard md:p-6`} aria-labelledby="membership-h">
    <h2 id="membership-h" className="mono font-bold">{title}</h2>
    {children}
  </section>
);

/** Server component: one `my_membership()` read decides which state shows. Pure rendering, no data fetching. */
export function MembershipPanel({ m }: { m: MembershipView }) {
  const renewal = renewalState(m);

  if (m.verified) {
    return (
      <div className="grid gap-5">
        <Section title="Your membership">
          <div className="flex flex-wrap items-center gap-3">
            <VerifiedBadge until={m.verifiedUntil} />
            {m.daysLeft !== null && <span className="tag tag-outline">{m.daysLeft} days left</span>}
          </div>
          <p className="text-ink-2">
            Your badge shows on your profile. Your name is locked while you are verified; contact the organisers if it needs
            to change.
          </p>
        </Section>
        {renewal === "soon" && (
          <section className="box-2 grid gap-4 border-l-8 border-l-yellow p-5 md:p-6" aria-labelledby="renew-h">
            <h2 id="renew-h" className="flex items-center gap-2 font-semibold">
              <Clock size={18} aria-hidden /> Your membership ends soon
            </h2>
            <p className="text-ink-2">
              When your IEEE membership renews, check it again here so your badge does not lapse
              {m.verifiedUntil ? ` on ${formatDateIST(m.verifiedUntil)}` : ""}. An officer re-confirms it in IEEE&apos;s Membership Validator.
            </p>
            {m.pending ? (
              <p role="status" aria-live="polite" className="font-semibold">A renewal is already waiting for an organiser to check.</p>
            ) : (
              <ClaimForm renew />
            )}
          </section>
        )}
      </div>
    );
  }

  if (m.pending || m.status === "pending_review") {
    return (
      <Section title="Waiting for review" tone="box-2">
        <p role="status" aria-live="polite" className="flex items-start gap-2 text-ink-2">
          <Clock size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>We have your claim. {PENDING_COPY.replace(/^Thanks\. /, "")} Nothing else is needed from you.</span>
        </p>
      </Section>
    );
  }

  if (m.status === "revoked") {
    return (
      <Section title="Membership not active" tone="box-2">
        <p className="flex items-start gap-2 text-ink-2">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>Your verification was removed by the organisers. If you think this is a mistake, please contact them.</span>
        </p>
        <Link href="/#contact" className="btn btn-sm btn-secondary w-fit">Contact the organisers</Link>
      </Section>
    );
  }

  return (
    <Section title={m.status === "rejected" ? "Verify your membership again" : "Verify your IEEE membership"}>
      {m.expired && m.verifiedUntil && (
        <p className="flex items-start gap-2 font-semibold">
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden /> Your membership lapsed on {formatDateIST(m.verifiedUntil)}.
        </p>
      )}
      {m.status === "rejected" && m.rejectReason && (
        <p className="flex items-start gap-2 border-l-8 border-l-red-ink bg-error-bg p-3 text-ink">
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden /> {REJECT_COPY[m.rejectReason]}
        </p>
      )}
      <p className="text-ink-2">
        Enter your 8-digit IEEE member number. If it is not on our roster, a branch officer confirms your membership in
        IEEE&apos;s Membership Validator; this usually takes a day. Verified members get a badge on their profile and can chat
        with the team.
      </p>
      <ClaimForm initialNumber={m.memberNumber} />
    </Section>
  );
}
