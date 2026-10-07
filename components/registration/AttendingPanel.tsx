import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { attendingView, profileHref } from "@/lib/registration/attending";
import type { Attendee } from "@/lib/registration/types";

export interface AttendingProps {
  /** Confirmed seats from the public seat-count view (the only number signed-out visitors get). */
  count: number;
  signedIn: boolean;
  /** Null when signed out (never fetched), or when the list could not be loaded. */
  attendees: Attendee[] | null;
  signInHref: string;
  /** Finished sessions get a past-tense empty state instead of "be the first". */
  ended: boolean;
}

const peopleLabel = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/**
 * Right-rail "who's going" panel. Signed-out visitors only ever receive the count (profiles are members-only):
 * the page does not query the list for them, so no names reach the HTML or the RSC payload.
 */
export function AttendingPanel({ count, signedIn, attendees, signInHref, ended }: AttendingProps) {
  const { total, shown, more } = attendingView(count, signedIn ? attendees : null);
  return (
    <section className="box p-6 shadow-hard" aria-labelledby="attending-h" data-reveal>
      <h2 id="attending-h" className="mono flex items-center gap-2 font-bold">
        <Users size={16} strokeWidth={2} aria-hidden /> Who&apos;s going
      </h2>
      <p className="mt-3 text-2xl font-semibold leading-none" data-testid="attending-count">
        {total} <span className="text-base font-medium text-ink-2">{ended ? "attended" : "attending"}</span>
      </p>

      {total === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{ended ? "No confirmed attendees." : "No one yet. Be the first to register."}</p>
      ) : !signedIn ? (
        <p className="mt-3 text-sm text-ink-2">
          <Link href={signInHref} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            Sign in to see who&apos;s going
          </Link>
        </p>
      ) : attendees === null ? (
        <p className="mt-3 text-sm text-ink-3" role="status">We couldn&apos;t load the list right now.</p>
      ) : (
        <>
          {shown.length > 0 && (
            <ul className="-mx-2 mt-4 grid gap-1 lg:max-h-[min(26rem,45vh)] lg:overflow-y-auto" aria-label={`${shown.length} of ${peopleLabel(total)} attending`}>
              {shown.map((a) => {
                const href = profileHref(a.handle);
                const name = a.fullName || `@${a.handle}`;
                const body = (
                  <>
                    <Avatar name={name} photo={a.avatarUrl} size={40} decorative referrerPolicy="no-referrer" className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{name}</span>
                      {a.headline && <span className="block truncate text-xs text-ink-3">{a.headline}</span>}
                    </span>
                  </>
                );
                return (
                  <li key={a.handle}>
                    {href ? (
                      <Link href={href} className="flex min-h-11 items-center gap-3 px-2 py-1 hover:bg-paper-2">{body}</Link>
                    ) : (
                      <span className="flex min-h-11 items-center gap-3 px-2 py-1">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {more > 0 && <p className="mt-3 text-sm font-semibold text-ink-3">+{more} more</p>}
        </>
      )}
    </section>
  );
}
