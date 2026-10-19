"use client";

import { HeroView } from "@/components/sections/HeroView";
import { useClock } from "@/components/providers/ClockProvider";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { useRegisterHref } from "@/components/registration/useRegisterHref";
import { heroHandles, resolveHero, stepProgress } from "@/lib/design/hero";
import { openSlug } from "@/lib/weekends";

/**
 * The opening section: a framed poster field with the extruded stair-step wordmark (the page's only h1), the next
 * step's rule head and the handles row; then the next-step panel and the stats strip. The look is the stored `hero`
 * block's preset (default Cobalt Poster); see HeroView. All of it stays inside the #top section (the dock's scroll-spy
 * target).
 */
export function Hero() {
  const { settings: event, stats, hero, events } = useSiteData();
  const { next, now } = useClock();
  const registerHref = useRegisterHref();

  return (
    <HeroView
      view={resolveHero(hero, next, now)}
      organizerShort={event.organizer.short}
      tagline={event.tagline}
      handles={heroHandles(event)}
      stats={stats}
      registerHref={registerHref(openSlug(next))}
      next={next}
      progress={stepProgress(next, events)}
    />
  );
}
