import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Clock, ExternalLink, Hourglass, Lock } from "lucide-react";
import { ticketPath, type CtaState } from "@/lib/registration/cta";
import { longDate, timeOf } from "@/lib/weekends";

/** CTA states in which /events/[slug]/register shows a notice instead of the form. */
export type UnavailableState = Exclude<CtaState, { kind: "register" } | { kind: "join_waitlist" }>;

function assertNever(x: never): never {
  throw new Error(`Unhandled registration state: ${JSON.stringify(x)}`);
}

function copy(state: UnavailableState): { text: string; Icon: typeof Clock; action?: { label: string; href: string; external?: boolean } } {
  switch (state.kind) {
    case "opens":
      return { text: `Registration opens on ${longDate(state.opensAt)} at ${timeOf(state.opensAt)} IST.`, Icon: Clock };
    case "paid_soon":
      return { text: "Paid registration for this session opens soon.", Icon: Lock };
    case "closed":
      return { text: "Registration for this session is closed.", Icon: Lock };
    case "registered":
      return {
        text: "You're registered for this session.",
        Icon: Check,
        action: { label: "View your ticket", href: ticketPath(state.registrationId) },
      };
    case "waitlisted":
      return {
        text: state.position > 0 ? `You're on the waitlist (number ${state.position}).` : "You're on the waitlist.",
        Icon: Hourglass,
        action: { label: "View your place", href: ticketPath(state.registrationId) },
      };
    case "external":
      return { text: "Registration for this session happens on a Google Form.", Icon: ExternalLink, action: { label: "Open the form", href: state.href, external: true } };
    case "sign_in":
      return { text: "Sign in to register for this session.", Icon: Lock, action: { label: "Sign in", href: state.href } };
    default:
      return assertNever(state);
  }
}

/** Shown on /events/[slug]/register when the viewer cannot (or need not) register right now. */
export function RegistrationUnavailable({ state, slug }: { state: UnavailableState; slug: string }) {
  const { text, Icon, action } = copy(state);
  return (
    <div className="box mx-auto max-w-2xl p-8 text-center shadow-[6px_6px_0_0_var(--ink)]" role="status">
      <Icon size={32} strokeWidth={2} className="mx-auto" aria-hidden />
      <p className="mt-4 text-xl font-semibold">{text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {action &&
          (action.external ? (
            <a href={action.href} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
              {action.label} <ExternalLink size={16} strokeWidth={2} aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <Link href={action.href} className="btn btn-primary">
              {action.label} <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          ))}
        <Link href={`/events/${encodeURIComponent(slug)}`} className="btn btn-secondary">
          <ArrowLeft size={16} strokeWidth={2} aria-hidden /> Back to the session
        </Link>
      </div>
    </div>
  );
}
