"use client";

import { ArrowRight, Check, Clock, ExternalLink, Hourglass, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ticketPath, type CtaState } from "@/lib/registration/cta";
import { longDate, timeOf } from "@/lib/weekends";

const note = "flex items-center gap-2 border-2 border-ink bg-paper p-4 font-semibold";

function assertNever(x: never): never {
  throw new Error(`Unhandled registration state: ${JSON.stringify(x)}`);
}

/**
 * The event page's registration call to action for every state in lib/registration/cta.ts.
 * Hrefs come from the state (built by registerPath/loginPath/safeFormUrl) or ticketPath; never a ticket code.
 */
export function RegisterCta({ state, step }: { state: CtaState; step: number }) {
  const trackProps = { from: "event_page", step };
  switch (state.kind) {
    case "register":
      return (
        <Button href={state.href} variant="ink" size="lg" className="w-full" trackAs="register_click" trackProps={trackProps}>
          Register, it&apos;s free <ArrowRight size={18} strokeWidth={2} aria-hidden />
        </Button>
      );
    case "join_waitlist":
      return (
        <div className="grid gap-2">
          <Button href={state.href} variant="ink" size="lg" className="w-full" trackAs="register_click" trackProps={trackProps}>
            Full — join the waitlist <ArrowRight size={18} strokeWidth={2} aria-hidden />
          </Button>
          <p className="text-sm text-ink-2">Every seat is taken. If one frees up, the waitlist moves in order.</p>
        </div>
      );
    case "sign_in":
      return (
        <div className="grid gap-2">
          <Button href={state.href} variant="ink" size="lg" className="w-full" trackAs="register_click" trackProps={trackProps}>
            <LogIn size={18} strokeWidth={2} aria-hidden /> Sign in to register
          </Button>
          {state.full && <p className="text-sm text-ink-2">This step is full. Sign in to join the waitlist.</p>}
        </div>
      );
    case "external":
      return (
        <Button href={state.href} external variant="ink" size="lg" className="w-full" trackAs="register_click" trackProps={trackProps}>
          Register on the Google Form <ExternalLink size={18} strokeWidth={2} aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </Button>
      );
    case "registered":
      return (
        <div className="grid gap-2">
          <p role="status" className="mono font-bold text-green-ink">You&apos;re registered</p>
          <Button href={ticketPath(state.registrationId)} variant="primary" size="lg" className="w-full">
            <Check size={18} strokeWidth={2.5} aria-hidden /> Registered ✓ · View ticket
          </Button>
        </div>
      );
    case "waitlisted":
      return (
        <div className="grid gap-2">
          <p role="status" className="mono font-bold">
            {state.position > 0 ? `You're number ${state.position} on the waitlist` : "You're on the waitlist"}
          </p>
          <Button href={ticketPath(state.registrationId)} variant="ghost" size="lg" className="w-full">
            <Hourglass size={18} strokeWidth={2} aria-hidden /> {state.position > 0 ? `Waitlisted #${state.position}` : "Waitlisted"} · View status
          </Button>
        </div>
      );
    case "opens":
      return (
        <p role="status" className={note}>
          <Clock size={18} strokeWidth={2} aria-hidden /> Registration opens on {longDate(state.opensAt)}, {timeOf(state.opensAt)} IST
        </p>
      );
    case "paid_soon":
      return (
        <p role="status" className={note}>
          <Clock size={18} strokeWidth={2} aria-hidden /> Paid registration opens soon
        </p>
      );
    case "closed":
      return (
        <p role="status" className={note}>
          <Lock size={18} strokeWidth={2} aria-hidden /> Registration closed
        </p>
      );
    default:
      return assertNever(state);
  }
}
