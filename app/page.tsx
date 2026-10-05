import { Hero } from "@/components/sections/Hero";
import { Marquee } from "@/components/sections/Marquee";
import { About } from "@/components/sections/About";
import { Stairway } from "@/components/sections/Stairway";
import { NextWeekend } from "@/components/sections/NextWeekend";
import { Experience } from "@/components/sections/Experience";
import { Tracks } from "@/components/sections/Tracks";
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

export default async function Home() {
  const { settings: event, events } = await getSiteData();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "EventSeries",
          name: event.name,
          description: event.description,
          url: event.siteUrl,
          organizer: { "@type": "Organization", name: event.organizer.name, url: event.organizer.url },
          subEvent: events.map((w) => eventJsonLd(w, event)),
        }}
      />
      <Hero />
      <Marquee />
      <About />
      <NextWeekend />
      <Stairway />
      {/* order alternates paper / paper-2 bands */}
      <Tracks />
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
