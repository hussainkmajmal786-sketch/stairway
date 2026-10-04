import { Crown, Flame, Footprints, Medal, Mountain, Trophy } from "lucide-react";
import { climbers, streakBadges, featuredProjects } from "@/data/leaderboard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

const PODIUM = [
  { place: 2, h: "h-24 md:h-32", fill: "bg-blue", label: "2nd" },
  { place: 1, h: "h-36 md:h-48", fill: "bg-yellow", label: "1st" },
  { place: 3, h: "h-16 md:h-24", fill: "bg-orange", label: "3rd" },
];
const BADGE_FILL = ["bg-green", "bg-orange", "bg-blue", "bg-yellow"];
const badgeIcons = [Footprints, Flame, Medal, Mountain];
const PROJECT_FILL = ["bg-blue", "bg-purple", "bg-red"];

export function Leaderboard() {
  const sorted = [...climbers].sort((a, b) => b.points - a.points);
  const top = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    <section id="leaderboard" aria-labelledby="leaderboard-title" className="section section-alt">
      <div className="wrap">
        <SectionHeader
          id="leaderboard-title"
          Icon={Trophy}
          eyebrow="Leaderboard · Hall of fame"
          title="The climbers [[setting the pace.]]"
          lead="10 points per weekend, bonuses for lab challenges and podium finishes. Keep your streak alive to earn badges."
        />

        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="box shadow-hard" data-reveal>
            <ol className="flex items-end justify-center gap-3 px-4 pt-8 md:gap-5" aria-label="Top three climbers">
              {PODIUM.map((p) => {
                const c = top[p.place - 1];
                if (!c) return null;
                return (
                  <li key={p.place} className="flex w-1/3 max-w-[170px] flex-col items-center text-center" style={{ order: p.place === 1 ? 2 : p.place === 2 ? 1 : 3 }}>
                    {p.place === 1 && <Crown size={24} strokeWidth={2} className="mb-2" aria-hidden />}
                    <Avatar name={c.name} size={p.place === 1 ? 72 : 56} />
                    <p className="mt-2 text-sm font-semibold md:text-base">{c.name}</p>
                    <p className="font-mono text-xs">{c.points} pts</p>
                    <div className={cn("mt-3 flex w-full items-start justify-center border-2 border-b-0 border-ink pt-2", p.fill, p.h)}>
                      <span className="font-mono text-xl font-bold">{p.label}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
            <ol className="border-t-2 border-ink" start={4}>
              {rest.map((c, i) => (
                <li key={c.name} className="flex items-center gap-4 border-b-2 border-ink px-5 py-3 last:border-b-0">
                  <span className="w-6 font-mono font-bold">{i + 4}</span>
                  <Avatar name={c.name} size={36} />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{c.name}</span>
                    <span className="block text-xs text-ink-3">{c.detail}</span>
                  </span>
                  <span className="tag tag-orange" title="Current streak">
                    <Flame size={12} strokeWidth={2.5} aria-hidden /> {c.streak}
                    <span className="sr-only">week streak</span>
                  </span>
                  <span className="w-12 text-right font-mono font-bold tabular">{c.points}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col gap-8">
            <div data-reveal>
              <h3 className="mono mb-4 font-bold">Streak badges</h3>
              <ul className="grid grid-cols-2 gap-3">
                {streakBadges.map((b, i) => {
                  const Icon = badgeIcons[i];
                  return (
                    <li key={b.id} className="box flex items-center gap-3 p-3 shadow-hard">
                      <span className={cn("grid h-11 w-11 shrink-0 place-items-center border-2 border-ink", BADGE_FILL[i])}>
                        <Icon size={20} strokeWidth={2} aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{b.label}</span>
                        <span className="block text-xs text-ink-3">{b.desc}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div data-reveal>
              <h3 className="mono mb-4 flex items-center gap-2 font-bold"><Trophy size={15} strokeWidth={2} aria-hidden /> Best projects so far</h3>
              <ul className="space-y-3">
                {featuredProjects.map((p, i) => (
                  <li key={p.title} className="box flex shadow-hard">
                    <div aria-hidden className={cn("w-20 shrink-0 border-r-2 border-ink", PROJECT_FILL[i % PROJECT_FILL.length])} />
                    <div className="p-4">
                      <span className="tag tag-outline">{p.step}</span>
                      <p className="mt-2 text-lg font-semibold">{p.title}</p>
                      <p className="text-xs text-ink-3">by {p.team}</p>
                      <p className="mt-1 text-sm text-ink-2">{p.blurb}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
