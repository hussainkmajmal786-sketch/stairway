import { CalendarCheck, Compass, Hammer, Users } from "lucide-react";
import { Heading } from "@/components/ui/Heading";

const POINTS = [
  { Icon: Compass, color: "bg-blue", title: "What it is", body: "A 12-step weekend series on artificial intelligence. Each Saturday is one step — a workshop, lab, talk or challenge — ending in a 24-hour hackathon at the summit." },
  { Icon: CalendarCheck, color: "bg-green", title: "Why weekends", body: "Learn without missing a single class. A steady weekly rhythm beats a one-off crash course; small steps add up to a real climb." },
  { Icon: Users, color: "bg-yellow", title: "Who it's for", body: "Every branch, every year. The first steps assume no prior AI knowledge — if you can open a laptop, you can start climbing." },
  { Icon: Hammer, color: "bg-red", title: "What's different", body: "You build, not just watch. Every step ends with something working on your machine, with industry mentors beside you." },
];

export function About() {
  return (
    <section id="about" aria-labelledby="about-title" className="section">
      <div className="wrap">
        <p className="eyebrow mb-5" data-reveal>About st(AI)rway</p>
        <Heading
          id="about-title"
          text="We believe every student can build with AI. st(AI)rway turns [[weekends into launchpads.]]"
          className="max-w-[22ch] text-[clamp(2rem,4.6vw,3.9rem)] font-medium leading-[1.08] tracking-[-0.03em]"
        />
        <ul className="mt-14 grid border-2 border-ink bg-paper sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map(({ Icon, color, title, body }, i) => (
            <li
              key={title}
              data-reveal
              style={{ ["--d" as string]: i }}
              className="border-ink p-6 max-sm:[&:not(:last-child)]:border-b-2 sm:max-lg:[&:nth-child(odd)]:border-r-2 sm:max-lg:[&:nth-child(-n+2)]:border-b-2 lg:[&:not(:last-child)]:border-r-2"
            >
              <span className={`grid h-11 w-11 place-items-center border-2 border-ink ${color}`}>
                <Icon size={20} strokeWidth={2} aria-hidden />
              </span>
              <h3 className="mono mt-5 text-sm font-bold">{title}</h3>
              <p className="mt-2 text-ink-3">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
