import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SOCIAL_LABELS, type SocialKey } from "@/lib/profile/options";
import { formatMonth, isHttpUrl, safeAvatarUrl } from "@/lib/profile/view";

/** Public fields only: nothing from profile_private (email, phone, IEEE id) ever reaches this component. */
export interface ProfileViewData {
  handle: string; fullName: string; avatarUrl: string | null; headline: string; bio: string;
  college: string; branch: string; year: string; skills: string[];
  /** Already filtered to http(s) URLs (see safeLinks). */
  links: { key: SocialKey; url: string }[];
  projects: { id: string; title: string; description: string; url: string }[];
  experience: { id: string; title: string; organization: string; start_date: string; end_date: string | null; description: string }[];
  isOwner: boolean;
}

// User-supplied URLs: new tab, no opener/referrer, and no SEO credit.
const EXT_REL = "noopener noreferrer nofollow ugc";

export function ProfileView({ p }: { p: ProfileViewData }) {
  const name = p.fullName || p.handle;
  const meta = [p.college, p.branch, p.year].filter(Boolean).join(" · ");
  return (
    <article className="wrap grid gap-8 py-10 md:py-14">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {/* Decorative: the h1 right next to it carries the name. */}
        <Avatar name={name} photo={safeAvatarUrl(p.avatarUrl)} size={128} decorative referrerPolicy="no-referrer" />
        <div className="min-w-0 flex-1">
          <p className="mono font-bold text-ink-3">@{p.handle}</p>
          <h1 className="mt-1 break-words text-4xl font-semibold leading-tight md:text-5xl">{name}</h1>
          {p.headline && <p className="mt-2 break-words text-lg text-ink-2">{p.headline}</p>}
          {meta && <p className="mt-2 text-sm text-ink-3">{meta}</p>}
        </div>
        {p.isOwner && (
          <Link href="/me/profile" className="btn btn-sm btn-ghost self-start sm:self-center">
            <Pencil size={14} strokeWidth={2} aria-hidden /> Edit profile
          </Link>
        )}
      </header>

      {p.links.length > 0 && (
        <ul className="flex flex-wrap gap-3" aria-label="Links">
          {p.links.map(({ key, url }) => (
            <li key={key}>
              <a href={url} target="_blank" rel={EXT_REL} className="btn btn-sm btn-ghost">
                {SOCIAL_LABELS[key]} <ExternalLink size={14} strokeWidth={2} aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {p.bio && (
        <section className="box p-6 shadow-hard" aria-labelledby="about-h">
          <h2 id="about-h" className="mono mb-3 font-bold">About</h2>
          <p className="whitespace-pre-line break-words text-ink-2">{p.bio}</p>
        </section>
      )}

      {p.skills.length > 0 && (
        <section aria-labelledby="skills-h">
          <h2 id="skills-h" className="mono mb-3 font-bold">Skills</h2>
          <ul className="flex flex-wrap gap-2">
            {p.skills.map((s) => <li key={s} className="tag tag-yellow">{s}</li>)}
          </ul>
        </section>
      )}

      {p.projects.length > 0 && (
        <section aria-labelledby="projects-h">
          <h2 id="projects-h" className="mono mb-3 font-bold">Projects</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {p.projects.map((pr) => (
              <li key={pr.id} className="box p-5 shadow-hard">
                <h3 className="break-words text-xl font-semibold">{pr.title}</h3>
                {pr.description && <p className="mt-2 whitespace-pre-line break-words text-ink-2">{pr.description}</p>}
                {isHttpUrl(pr.url) && (
                  <a href={pr.url} target="_blank" rel={EXT_REL} className="mt-3 inline-block break-all font-semibold text-blue-ink underline">
                    {pr.url}<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.experience.length > 0 && (
        <section aria-labelledby="exp-h">
          <h2 id="exp-h" className="mono mb-3 font-bold">Experience</h2>
          <ol className="grid gap-4">
            {p.experience.map((x) => {
              const start = formatMonth(x.start_date);
              const end = x.end_date ? formatMonth(x.end_date) : "Present";
              return (
              <li key={x.id} className="box p-5 shadow-hard">
                <h3 className="break-words text-lg font-semibold">
                  {x.title} <span className="font-normal text-ink-3">· {x.organization}</span>
                </h3>
                {start && end && <p className="mono mt-1 text-[0.7rem] font-bold text-ink-3">{start} – {end}</p>}
                {x.description && <p className="mt-2 whitespace-pre-line break-words text-ink-2">{x.description}</p>}
              </li>
              );
            })}
          </ol>
        </section>
      )}
    </article>
  );
}
