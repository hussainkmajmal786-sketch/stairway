import { Award, FlaskConical, Hammer, MessagesSquare, Mic2, Presentation, Sparkles, Trophy, Users } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/utils";

const TILES = [
  { Icon: Hammer, title: "Hands-on Workshops", body: "Build, don't just watch. Every session ends with working code on your laptop.", color: "bg-yellow", span: "md:col-span-2 md:row-span-2", big: true },
  { Icon: Mic2, title: "Expert Talks", body: "Learn from people shipping AI in industry and research.", color: "bg-blue" },
  { Icon: FlaskConical, title: "AI Labs", body: "Real datasets, real models, real GPUs.", color: "bg-green" },
  { Icon: Trophy, title: "Competitions & Hackathons", body: "Prizes, glory and a 24-hour summit.", color: "bg-orange", span: "md:col-span-2" },
  { Icon: Presentation, title: "Project Showcases", body: "Demo your builds to mentors and peers.", color: "bg-purple" },
  { Icon: Users, title: "Networking", body: "Meet mentors, alumni and future co-founders.", color: "bg-red" },
  { Icon: Award, title: "Certificates", body: "IEEE-backed recognition for every step.", color: "bg-blue" },
  { Icon: MessagesSquare, title: "Community", body: "A WhatsApp & Discord crew that lasts beyond the weekends.", color: "bg-green" },
];

export function Experience() {
  return (
    <section id="experience" aria-labelledby="experience-title" className="section">
      <div className="wrap">
        <SectionHeader
          id="experience-title"
          Icon={Sparkles}
          eyebrow="What you'll experience"
          title="More than a seminar. A [[launchpad.]]"
          lead="Every weekend mixes learning, building and people."
        />
        <ul className="grid auto-rows-[minmax(190px,auto)] gap-5 md:grid-cols-4">
          {TILES.map(({ Icon, title, body, color, span, big }, i) => (
            <li
              key={title}
              data-reveal
              style={{ ["--d" as string]: i % 4 }}
              className={cn("box lift flex flex-col justify-between p-6 shadow-hard", big && "bg-paper-2", span)}
            >
              <span className={cn("grid place-items-center border-2 border-ink", color, big ? "h-16 w-16" : "h-12 w-12")}>
                <Icon size={big ? 30 : 22} strokeWidth={2} aria-hidden />
              </span>
              <div className="mt-8">
                <h3 className={cn("font-semibold", big ? "text-3xl md:text-4xl" : "text-xl")}>{title}</h3>
                <p className={cn("mt-2 text-ink-3", big ? "max-w-sm text-lg" : "text-[0.95rem]")}>{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
