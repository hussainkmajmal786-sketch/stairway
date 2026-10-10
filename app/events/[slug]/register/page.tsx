import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BRANCHES, YEARS } from "@/lib/profile/options";
import { ctaEvent, ctaState, registerPath } from "@/lib/registration/cta";
import { registrationError } from "@/lib/registration/errors";
import { externalRegistrationUrl, fallbackFormUrl } from "@/lib/registration/external";
import { parseQuestions, type Question } from "@/lib/registration/questions";
import { getMyRegistration } from "@/lib/registration/server";
import type { Registrant } from "@/lib/registration/schema";
import { longDate, pad2, timeOf } from "@/lib/weekends";
import { PageHero } from "@/components/ui/PageHero";
import { ghostWord } from "@/lib/design/ghost";
import { ErrorPanel } from "@/components/registration/ErrorPanel";
import { RegistrationForm } from "@/components/registration/RegistrationForm";
import { RegistrationUnavailable } from "@/components/registration/RegistrationUnavailable";

/** Same rule as the events.slug CHECK. */
const SLUG_RE = /^[a-z0-9-]{2,80}$/;

export async function generateMetadata({ params }: PageProps<"/events/[slug]/register">): Promise<Metadata> {
  const { slug } = await params;
  const robots = { index: false, follow: false };
  // Public, request-cached site data only (no session): the title says nothing a visitor can't see on the event page.
  const ev = SLUG_RE.test(slug) ? (await getSiteData()).events.find((e) => e.slug === slug) : undefined;
  return { title: ev ? `Register: ${ev.title}` : "Register", robots };
}
// Request-time clock (the root layout is force-dynamic); a helper so render stays lint-pure.
const requestNow = () => Date.now();
const oneOf = (list: readonly string[], v: string | undefined) => (v && list.includes(v) ? v : "");

export default async function RegisterPage({ params }: PageProps<"/events/[slug]/register">) {
  const { slug } = await params;
  // A malformed slug can never be an event: 404 without touching the session or the database.
  if (!SLUG_RE.test(slug)) notFound();
  // Session first: signed-out (or not onboarded) visitors are redirected before anything is looked up.
  const { user, profile } = await requireOnboarded(registerPath(slug));

  const { settings, events } = await getSiteData();
  const ev = events.find((e) => e.slug === slug);
  if (!ev) notFound();
  // Google-Form mode: never show the on-site form; the event page links to the (https-only) form.
  if (externalRegistrationUrl(settings.registration)) redirect(`/events/${encodeURIComponent(ev.slug)}`);

  const mine = await getMyRegistration(ev.id, user.id);
  const state = ctaState({ now: requestNow(), event: ctaEvent(ev), signedIn: true, registration: mine, externalUrl: null });
  const fallbackUrl = fallbackFormUrl(settings.registration);

  const page = (body: React.ReactNode) => (
    <>
      <PageHero
        eyebrow={`${ev.society.shortName} · Step ${pad2(ev.step)} · Registration`}
        title={ev.title}
        lead={`${longDate(ev.start)} · ${timeOf(ev.start)} – ${timeOf(ev.end)} IST`}
        ghost={ghostWord({ kind: "session", step: ev.step, finale: ev.isFinale })}
      />
      <div className="wrap pb-[var(--section-y)]">{body}</div>
    </>
  );

  // Already registered / waitlisted, not open, closed or paid. (Not a redirect: after a successful registration the
  // action re-renders this route, and a render-time redirect would race the form's own navigation to the ticket.)
  if (state.kind !== "register" && state.kind !== "join_waitlist") {
    return page(<RegistrationUnavailable state={state} slug={ev.slug} />);
  }

  const db = await createClient();
  const [{ data: evRow, error: evError }, { data: p }, { data: priv }] = await Promise.all([
    db.from("events").select("questions").eq("id", ev.id).maybeSingle(),
    db.from("profiles").select("full_name, college, branch, year").eq("id", user.id).maybeSingle(),
    db.from("profile_private").select("phone, ieee_member_id").eq("user_id", user.id).maybeSingle(),
  ]);
  let questions: Question[] | null = null;
  try {
    if (!evError && evRow) questions = parseQuestions(evRow.questions);
  } catch {
    // Stored questions drifted from the schema; the server action would refuse too.
  }
  if (!questions) {
    return page(
      <div className="mx-auto max-w-2xl">
        <ErrorPanel error={registrationError("unknown")} slug={ev.slug} fallbackUrl={fallbackUrl} />
      </div>,
    );
  }

  const initial: Registrant = {
    fullName: p?.full_name || profile.fullName,
    college: p?.college ?? "",
    branch: oneOf(BRANCHES, p?.branch),
    year: oneOf(YEARS, p?.year),
    phone: priv?.phone ?? "",
    ieeeMemberId: priv?.ieee_member_id ?? "",
  };

  return page(
    <RegistrationForm
      slug={ev.slug}
      questions={questions}
      initial={initial}
      waitlist={state.kind === "join_waitlist"}
      fallbackUrl={fallbackUrl}
    />,
  );
}
