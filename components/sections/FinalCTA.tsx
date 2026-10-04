"use client";

import { ArrowUpRight } from "lucide-react";
import { useClock } from "@/components/providers/ClockProvider";
import { Countdown } from "@/components/ui/Countdown";
import { Button } from "@/components/ui/Button";
import { SeatsBar } from "@/components/ui/Badges";
import { pad2, registerHref } from "@/lib/weekends";

export function FinalCTA() {
  const { next } = useClock();
  return (
    <section id="register" aria-labelledby="cta-title" className="border-y-2 border-ink bg-yellow">
      <div className="wrap grid gap-12 py-[clamp(72px,10vw,128px)] lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <p className="mono font-bold" data-reveal>Step {pad2(next.step)} · {next.title}</p>
          <h2 id="cta-title" className="mt-4 text-[clamp(3rem,9vw,7.5rem)] font-medium leading-[0.92] tracking-[-0.045em]" data-reveal>
            Your next step is waiting.
          </h2>
        </div>
        <div className="border-2 border-ink bg-paper p-6 shadow-[6px_6px_0_0_var(--ink)] md:p-8" data-reveal>
          <p className="mono mb-4 font-bold">Doors open in</p>
          <Countdown target={next.start} size="md" />
          <SeatsBar seatsLeft={next.seatsLeft} seatsTotal={next.seatsTotal} className="mt-6" />
          <Button href={registerHref(next.slug)} variant="ink" size="lg" className="mt-6 w-full" trackAs="register_click" trackProps={{ from: "final_cta" }}>
            Register now <ArrowUpRight size={20} strokeWidth={2} />
          </Button>
        </div>
      </div>
    </section>
  );
}
