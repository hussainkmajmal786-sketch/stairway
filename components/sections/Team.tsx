"use client";

import { useState } from "react";
import { UsersRound } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Github, Instagram, Linkedin } from "@/components/ui/BrandIcons";

export function Team() {
  const { team } = useSiteData();
  const teamGroups = ["All", ...Array.from(new Set(team.map((m) => m.group)))] as const;
  const [group, setGroup] = useState<string>("All");
  const list = team.filter((m) => group === "All" || m.group === group);
  const icon = "grid h-11 w-11 place-items-center border-2 border-ink bg-paper-2 hover:bg-yellow";

  return (
    <section id="team" aria-labelledby="team-title" className="section section-alt">
      <div className="wrap">
        <SectionHeader id="team-title" Icon={UsersRound} eyebrow="The team" title="The crew [[building the steps.]]" lead="Students and faculty of IEEE SB CEK who plan, build and run every weekend." />
        <div className="mb-10 flex flex-wrap gap-2" role="group" aria-label="Filter team by group">
          {teamGroups.map((g) => (
            <button key={g} className="chip-btn" aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>
          ))}
        </div>
        <ul className="grid gap-5 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {list.map((m, i) => (
            <li key={m.name} className="box flex flex-col shadow-hard" data-reveal style={{ ["--d" as string]: i % 4 }}>
              <div className="flex items-center gap-4 border-b-2 border-ink p-5">
                <Avatar name={m.name} photo={m.photo} size={64} />
                <div>
                  <h3 className="text-lg font-semibold leading-tight">{m.name}</h3>
                  <p className="mono mt-1 text-[0.66rem] font-bold text-blue-ink">{m.role}</p>
                </div>
              </div>
              <p className="flex-1 p-5 text-sm text-ink-2">
                <span className="tag tag-yellow mr-2 !py-0">Fun fact</span>
                {m.funFact}
              </p>
              <div className="flex gap-2 px-5 pb-5">
                {m.links.linkedin && <a href={m.links.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${m.name} on LinkedIn`} className={icon}><Linkedin size={18} /></a>}
                {m.links.instagram && <a href={m.links.instagram} target="_blank" rel="noopener noreferrer" aria-label={`${m.name} on Instagram`} className={icon}><Instagram size={18} /></a>}
                {m.links.github && <a href={m.links.github} target="_blank" rel="noopener noreferrer" aria-label={`${m.name} on GitHub`} className={icon}><Github size={18} /></a>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
