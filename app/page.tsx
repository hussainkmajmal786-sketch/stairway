import { Hero } from "@/components/sections/Hero";
import { Marquee } from "@/components/sections/Marquee";
import { About } from "@/components/sections/About";
import { NextWeekend } from "@/components/sections/NextWeekend";
import { Experience } from "@/components/sections/Experience";
import { Societies } from "@/components/sections/Societies";
import { Speakers } from "@/components/sections/Speakers";
import { Leaderboard } from "@/components/sections/Leaderboard";
import { Gallery } from "@/components/sections/Gallery";
import { Testimonials } from "@/components/sections/Testimonials";
import { Perks } from "@/components/sections/Perks";
import { Resources } from "@/components/sections/Resources";
import { Sponsors } from "@/components/sections/Sponsors";
import { Team } from "@/components/sections/Team";
import { AboutIEEE } from "@/components/sections/AboutIEEE";
import { FAQ } from "@/components/sections/FAQ";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { Community } from "@/components/sections/Community";
import { getSiteData } from "@/lib/site/load";
import { eventJsonLd, JsonLd } from "@/lib/jsonld";

// Request-time clock (the root layout is force-dynamic); a helper so render stays lint-pure.
const requestNow = () => Date.now();

export default async function Home() {
  const { settings, events } = await getSiteData();
  const now = requestNow();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "EventSeries",
          name: settings.name,
          description: settings.description,
          url: settings.siteUrl,
          organizer: { "@type": "Organization", name: settings.organizer.name, url: settings.organizer.url },
          subEvent: events.map((e) => eventJsonLd(e, settings, now)),
        }}
      />
      <Hero />
      <Marquee />
      <About />
      <NextWeekend />
      <Societies />
      <Speakers />
      <Leaderboard />
      <Experience />
      <Testimonials />
      <Gallery />
      <Resources />
      <Perks />
      <Team />
      <Sponsors />
      <FAQ />
      <AboutIEEE />
      <FinalCTA />
      <Community />
    </>
  );
}
