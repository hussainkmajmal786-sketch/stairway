import { ArrowUpRight, Globe2, Lightbulb, Users2 } from "lucide-react";
import { getSiteData } from "@/lib/site/load";
import { SectionHeader } from "@/components/ui/SectionHeader";

const FACTS = [
  { Icon: Globe2, k: "400K+", v: "IEEE members in 190+ countries", c: "text-blue-ink" },
  { Icon: Users2, k: "8", v: "Technical societies active at CEK", c: "text-green-ink" },
  { Icon: Lightbulb, k: "60+", v: "Events run by IEEE SB CEK", c: "text-purple-ink" },
];

export async function AboutIEEE() {
  const { settings: event } = await getSiteData();
  return (
    <section id="ieee" aria-labelledby="ieee-title" className="section">
      <div className="wrap grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <SectionHeader id="ieee-title" eyebrow="Organised by" title="IEEE Student Branch, [[CEK.]]" className="!mb-6" />
          <div className="space-y-4 text-ink-2" data-reveal>
            <p><strong className="text-ink">IEEE</strong> is the world&apos;s largest technical professional organisation, dedicated to advancing technology for the benefit of humanity.</p>
            <p>The <strong className="text-ink">IEEE Student Branch at College of Engineering Kidangoor</strong> brings that mission to campus — workshops, hackathons, industrial visits and technical talks through its societies, including Computer Society, Robotics &amp; Automation, Power &amp; Energy and Women in Engineering.</p>
            <p>st(AI)rway is our most ambitious series yet: a structured climb into artificial intelligence, open to every student.</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3" data-reveal>
            <a href={event.ieee.joinUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Join IEEE <ArrowUpRight size={16} strokeWidth={2} /></a>
            <a href={event.ieee.branchUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Visit IEEE SB CEK</a>
          </div>
        </div>
        <div className="box shadow-[6px_6px_0_0_var(--ink)]" data-reveal>
          <div className="flex items-center gap-4 border-b-2 border-ink bg-blue p-5">
            <span className="grid h-14 w-14 place-items-center border-2 border-ink bg-paper font-mono font-bold">IEEE</span>
            <div>
              <p className="text-xl font-semibold">IEEE SB CEK</p>
              <p className="mono font-bold">Kerala Section · Region 10</p>
            </div>
          </div>
          <dl>
            {FACTS.map(({ Icon, k, v, c }) => (
              <div key={v} className="flex items-center gap-4 border-b-2 border-ink p-5 last:border-b-0">
                <Icon size={24} strokeWidth={2} aria-hidden />
                <dt className="sr-only">{v}</dt>
                <dd>
                  <span className={`block text-4xl font-medium ${c}`}>{k}</span>
                  <span className="text-sm text-ink-3" aria-hidden>{v}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
