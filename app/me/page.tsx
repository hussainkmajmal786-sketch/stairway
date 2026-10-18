import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyTickets } from "@/lib/registration/server";
import { nextStep } from "@/lib/tickets/list";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { parseMembership, renewalState } from "@/lib/community/membership";
import { NextTicketCard } from "@/components/tickets/NextTicketCard";

// Request-time clock (the root layout is force-dynamic); a helper so render stays lint-pure.
const requestNow = () => Date.now();

export default async function MePage() {
  const { user, profile } = await requireOnboarded("/me");
  const db = await createClient();
  const [{ data: p }, { count: projects }, { count: experience }, tickets, { data: mem }] = await Promise.all([
    db.from("profiles").select("headline, bio, skills, links, avatar_url").eq("id", user.id).maybeSingle(),
    db.from("profile_projects").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    db.from("profile_experience").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    // The overview still renders if tickets fail to load (the card then says so instead of "none yet").
    getMyTickets(user.id).catch(() => null),
    db.rpc("my_membership"),
  ]);
  const membership = parseMembership(mem);
  const renewal = renewalState(membership);
  const next = tickets ? nextStep(tickets, requestNow()) : null;
  const rawLinks = p?.links && typeof p.links === "object" && !Array.isArray(p.links) ? p.links : {};
  const links = Object.values(rawLinks).filter((v) => typeof v === "string" && v.length > 0);
  const steps = [
    { label: "Add a profile photo", done: !!p?.avatar_url },
    { label: "Write a headline", done: !!p?.headline },
    { label: "Tell people about yourself", done: !!p?.bio },
    { label: "List your skills", done: (p?.skills?.length ?? 0) > 0 },
    { label: "Add a link (LinkedIn, GitHub…)", done: links.length > 0 },
    { label: "Add a project", done: (projects ?? 0) > 0 },
    { label: "Add experience", done: (experience ?? 0) > 0 },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="grid gap-8">
      <header className="flex items-center gap-5">
        <Avatar name={profile.fullName} photo={profile.avatarUrl ?? undefined} size={72} referrerPolicy="no-referrer" />
        <div className="min-w-0">
          <p className="mono font-bold text-ink-3">Welcome back</p>
          <h1 className="break-words text-3xl font-semibold md:text-4xl">{profile.fullName}</h1>
          {membership.verified && <div className="mt-2"><VerifiedBadge until={membership.verifiedUntil} /></div>}
        </div>
      </header>
      <NextTicketCard next={next} failed={tickets === null} />
      {!membership.verified && (
        <section className="box-2 flex flex-wrap items-center justify-between gap-3 p-5" aria-labelledby="ieee-card-h">
          <div>
            <h2 id="ieee-card-h" className="font-semibold">IEEE member?</h2>
            <p className="text-ink-2">
              {membership.pending ? "Your membership claim is waiting for review." : "Verify your membership to get a badge and chat with the team."}
            </p>
          </div>
          <Link href="/me/membership" className="btn btn-sm btn-secondary">{membership.pending ? "View status" : "Verify membership"}</Link>
        </section>
      )}
      {membership.verified && renewal === "soon" && (
        <section className="box-2 flex flex-wrap items-center justify-between gap-3 border-l-8 border-l-yellow p-5" aria-labelledby="ieee-renew-h">
          <div>
            <h2 id="ieee-renew-h" className="font-semibold">Your IEEE membership ends in {membership.daysLeft} {membership.daysLeft === 1 ? "day" : "days"}</h2>
            <p className="text-ink-2">Renew it so your badge does not lapse.</p>
          </div>
          <Link href="/me/membership" className="btn btn-sm btn-primary">Renew</Link>
        </section>
      )}
      <section className="box shadow-hard" aria-labelledby="complete-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-paper-2 px-5 py-3">
          <h2 id="complete-title" className="mono font-bold">Profile completeness</h2>
          <span className="tag tag-ink">{done} / {steps.length}</span>
        </div>
        <ul className="grid gap-3 p-5 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3">
              {s.done ? (
                <Check size={18} strokeWidth={2.5} className="shrink-0 text-green-ink" aria-hidden />
              ) : (
                <Circle size={18} strokeWidth={2} className="shrink-0 text-ink-4" aria-hidden />
              )}
              <span className={s.done ? "text-ink-3 line-through" : ""}>{s.label}</span>
              <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3 border-t-2 border-ink p-5">
          <Link href="/me/profile" className="btn btn-primary">
            Edit profile <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
          <Link href={`/u/${profile.handle}`} className="btn btn-secondary">View public profile</Link>
        </div>
      </section>
    </div>
  );
}
