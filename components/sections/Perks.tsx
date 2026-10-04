import { Award, BadgeCheck, Briefcase, FolderGit2, Gift, IdCard } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StairMark } from "@/components/ui/Logo";

const PERKS = [
  { Icon: Award, color: "bg-yellow", title: "Participation certificates", body: "Issued by IEEE SB CEK for every step you attend." },
  { Icon: BadgeCheck, color: "bg-green", title: "Merit certificates", body: "For challenge winners and Summit finishers." },
  { Icon: Gift, color: "bg-red", title: "Prizes & swag", body: "₹1,00,000 Summit prize pool, stickers, tees and more." },
  { Icon: IdCard, color: "bg-blue", title: "IEEE member benefits", body: "Free entry, priority seats and IEEE Xplore access." },
  { Icon: FolderGit2, color: "bg-purple", title: "Portfolio-ready projects", body: "Every step leaves you with code worth showing." },
  { Icon: Briefcase, color: "bg-orange", title: "Mentorship & internships", body: "Direct connections to our speakers' teams." },
];

/** HTML mock of the certificate so it stays crisp and editable. */
function Certificate() {
  return (
    <div className="relative aspect-[1.414/1] w-full rotate-[-1.5deg] border-2 border-ink bg-paper p-[6%] shadow-[8px_8px_0_0_var(--ink)]" role="img" aria-label="Sample certificate of participation">
      <div className="absolute inset-3 border-2 border-dashed border-ink/40" aria-hidden />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold md:text-base"><StairMark size={22} /> st(AI)rway</span>
          <span className="border-2 border-ink bg-blue px-2 py-0.5 font-mono text-[0.6rem] font-bold">IEEE SB CEK</span>
        </div>
        <p className="mono mt-[6%] text-[0.58rem] font-bold md:text-[0.68rem]">Certificate of participation</p>
        <p className="mt-2 text-xl font-semibold md:text-3xl">Your Name Here</p>
        <p className="mt-2 max-w-[85%] text-[0.68rem] text-ink-2 md:text-xs">has climbed Step 04 — Seeing Machines: Computer Vision with OpenCV &amp; CNNs.</p>
        <div className="mt-auto flex items-end justify-between">
          <div>
            <div className="h-0.5 w-24 bg-ink" />
            <p className="mt-1 text-[0.58rem] text-ink-3">Branch Counselor</p>
          </div>
          <div className="grid h-14 w-14 rotate-6 place-items-center border-2 border-ink bg-yellow text-center font-mono text-[0.55rem] font-bold uppercase leading-tight md:h-16 md:w-16">
            Step<br />04
          </div>
        </div>
      </div>
    </div>
  );
}

export function Perks() {
  return (
    <section id="perks" aria-labelledby="perks-title" className="section">
      <div className="wrap grid items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeader id="perks-title" Icon={Award} eyebrow="Perks & certificates" title="Every step [[counts.]]" lead="What you take home besides the skills." />
          <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {PERKS.map(({ Icon, color, title, body }, i) => (
              <li key={title} className="flex gap-4" data-reveal style={{ ["--d" as string]: i }}>
                <span className={`grid h-11 w-11 shrink-0 place-items-center border-2 border-ink ${color}`}>
                  <Icon size={20} strokeWidth={2} aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-ink-3">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div data-reveal className="px-2">
          <Certificate />
        </div>
      </div>
    </section>
  );
}
