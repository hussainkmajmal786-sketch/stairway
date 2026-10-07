import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { pad2 } from "@/lib/weekends";
import { WeekendDetail } from "@/components/weekend/WeekendDetail";
import { eventJsonLd, JsonLd } from "@/lib/jsonld";
import { getAuthState } from "@/lib/auth/session";
import { ctaEvent, ctaState, loginPath } from "@/lib/registration/cta";
import { externalRegistrationUrl } from "@/lib/registration/external";
import { getAttendees, getMyRegistration } from "@/lib/registration/server";

const findEvent = async (slug: string) => {
  const data = await getSiteData();
  return { data, ev: data.events.find((e) => e.slug === slug) };
};

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data, ev } = await findEvent(slug);
  if (!ev) return {};
  const title = `${ev.society.shortName} Step ${pad2(ev.step)}: ${ev.title} — ${ev.topic}`;
  return {
    title,
    description: ev.summary,
    alternates: { canonical: `/events/${ev.slug}` },
    openGraph: { title: `${title} | ${data.settings.name}`, description: ev.summary, url: `/events/${ev.slug}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} | ${data.settings.name}`, description: ev.summary },
  };
}

// Request-time clock (the root layout is force-dynamic); a helper so render stays lint-pure.
const requestNow = () => Date.now();

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  // getAuthState is request-cached (the root layout already called it) and returns at once without a session cookie,
  // so signed-out visitors cost no auth or registration query here.
  const [{ data, ev }, auth] = await Promise.all([findEvent(slug), getAuthState()]);
  if (!ev) notFound();
  const now = requestNow();
  const ended = Date.parse(ev.end) < now;
  // Own row only (RLS + user_id filter) and only id/status/waitlist position: no ticket code reaches this page.
  // A finished session shows its "Climbed" panel instead of a CTA, so it needs no lookup.
  // The attendee list is members-only: signed-out visitors trigger no query and get only the public seat count.
  // A failed list read degrades to the count (null), never a broken page.
  const [registration, attendees] = auth.user
    ? await Promise.all([
        ended ? null : getMyRegistration(ev.id, auth.user.id),
        getAttendees(ev.id).catch(() => null),
      ])
    : [null, null];
  const cta = ctaState({
    now,
    event: ctaEvent(ev),
    signedIn: !!auth.user,
    registration,
    externalUrl: externalRegistrationUrl(data.settings.registration),
  });
  return (
    <>
      <JsonLd data={eventJsonLd(ev, data.settings, now)} />
      <WeekendDetail
        slug={slug}
        cta={cta}
        attending={{
          count: ev.seatsFilled,
          signedIn: !!auth.user,
          attendees: auth.user ? attendees : null,
          signInHref: loginPath(`/events/${ev.slug}`),
          ended,
        }}
      />
    </>
  );
}
