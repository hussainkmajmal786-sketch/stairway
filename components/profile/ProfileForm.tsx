"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { ProfileDetailsSchema, fieldErrors } from "@/lib/profile/schema";
import { BRANCHES, SOCIAL_KEYS, SOCIAL_LABELS, YEARS, type SocialKey } from "@/lib/profile/options";
import { linksToDb } from "@/lib/profile/editor";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import { AvatarUploader } from "./AvatarUploader";

export interface ProfileFormValues {
  fullName: string; headline: string; bio: string; college: string; branch: string; year: string;
  skills: string[]; links: Record<SocialKey, string>; avatarUrl: string | null;
}

const MAX_SKILLS = 30;
const MAX_SKILL_LEN = 30;

export function ProfileForm({ userId, initial }: { userId: string; initial: ProfileFormValues }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [skillDraft, setSkillDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  // Synchronous double-submit guard (busy state only applies after the next render).
  const inFlight = useRef(false);

  const setSkillError = (msg: string | null) =>
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next.skills = msg;
      else delete next.skills;
      return next;
    });

  const addSkill = () => {
    const s = skillDraft.trim().replace(/\s+/g, " ");
    if (!s) return setSkillDraft("");
    if (s.length > MAX_SKILL_LEN) return setSkillError(`Keep each skill under ${MAX_SKILL_LEN} characters.`);
    if (d.skills.some((x) => x.toLowerCase() === s.toLowerCase())) return setSkillDraft("");
    if (d.skills.length >= MAX_SKILLS) return setSkillError(`Up to ${MAX_SKILLS} skills.`);
    setD((x) => ({ ...x, skills: [...x.skills, s] }));
    setSkillDraft("");
    setSkillError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const parsed = ProfileDetailsSchema.safeParse(d);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      // Per-item skill issues come back as "skills.3"; show them on the skills field.
      const skillKey = Object.keys(errs).find((k) => k.startsWith("skills."));
      if (skillKey && !errs.skills) errs.skills = "Each skill must be 1–30 characters.";
      setErrors(errs);
      setStatus({ ok: false, text: "A few fields need a look." });
      return;
    }
    const v = parsed.data;
    inFlight.current = true;
    setErrors({});
    setBusy(true);
    setStatus(null);
    try {
      const { data, error } = await createClient()
        .from("profiles")
        .update({
          full_name: v.fullName, headline: v.headline, bio: v.bio, college: v.college, branch: v.branch, year: v.year,
          skills: v.skills, links: linksToDb(v.links), avatar_url: d.avatarUrl,
        })
        .eq("id", userId)
        .select("id");
      // RLS makes a blocked update look like "0 rows", so treat that as a failure too.
      if (error || !data?.length) {
        setStatus({ ok: false, text: "Couldn't save. Please try again." });
        return;
      }
      setD((x) => ({ ...x, ...v }));
      setStatus({ ok: true, text: "Profile saved." });
      router.refresh();
    } catch {
      setStatus({ ok: false, text: "Couldn't save. Check your connection and try again." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const aria = (k: string) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-err` : undefined });

  return (
    <form onSubmit={submit} noValidate className="box grid gap-6 p-6 shadow-hard md:grid-cols-2 md:p-8" aria-label="Profile details">
      <div className="md:col-span-2">
        <AvatarUploader
          userId={userId} currentUrl={d.avatarUrl} name={d.fullName}
          onUploaded={(u) => {
            setD((x) => ({ ...x, avatarUrl: u }));
            setStatus({ ok: true, text: "Photo uploaded. Save your profile to keep it." });
          }}
        />
      </div>
      <Field id="fullName" label="Full name" required error={errors.fullName}>
        <input id="fullName" autoComplete="name" maxLength={80} className={inputCls} value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} {...aria("fullName")} />
      </Field>
      <Field id="headline" label="Headline" error={errors.headline} hint="e.g. 3rd-year ECE · robotics tinkerer">
        <input id="headline" maxLength={120} className={inputCls} value={d.headline} onChange={(e) => setD({ ...d, headline: e.target.value })} {...aria("headline")} />
      </Field>
      <Field id="bio" label="About you" error={errors.bio} className="md:col-span-2">
        <textarea id="bio" maxLength={1500} className={textareaCls} value={d.bio} onChange={(e) => setD({ ...d, bio: e.target.value })} {...aria("bio")} />
      </Field>
      <Field id="college" label="College" required error={errors.college} className="md:col-span-2">
        <input id="college" autoComplete="organization" maxLength={120} className={inputCls} value={d.college} onChange={(e) => setD({ ...d, college: e.target.value })} {...aria("college")} />
      </Field>
      <Field id="branch" label="Branch" required error={errors.branch}>
        <select id="branch" className={inputCls} value={d.branch} onChange={(e) => setD({ ...d, branch: e.target.value })} {...aria("branch")}>
          <option value="">Select branch</option>
          {BRANCHES.map((b) => <option key={b}>{b}</option>)}
        </select>
      </Field>
      <Field id="year" label="Year" required error={errors.year}>
        <select id="year" className={inputCls} value={d.year} onChange={(e) => setD({ ...d, year: e.target.value })} {...aria("year")}>
          <option value="">Select year</option>
          {YEARS.map((y) => <option key={y}>{y}</option>)}
        </select>
      </Field>

      <div className="md:col-span-2">
        <Field id="skills" label="Skills" error={errors.skills} hint={`Type a skill and press Enter (up to ${MAX_SKILLS}).`}>
          <input
            id="skills" className={inputCls} value={skillDraft} maxLength={MAX_SKILL_LEN + 10}
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addSkill();
              }
            }}
            onBlur={addSkill}
            {...aria("skills")}
          />
        </Field>
        {d.skills.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your skills">
            {d.skills.map((s) => (
              <li key={s} className="tag tag-yellow !py-0 !pr-0">
                {s}
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center hover:bg-ink hover:text-paper lg:h-7 lg:w-7"
                  aria-label={`Remove skill ${s}`}
                  onClick={() => setD((x) => ({ ...x, skills: x.skills.filter((y) => y !== s) }))}
                >
                  <X size={12} strokeWidth={3} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {SOCIAL_KEYS.map((k) => (
        <Field key={k} id={`links-${k}`} label={SOCIAL_LABELS[k]} error={errors[`links.${k}`]}>
          <input
            id={`links-${k}`} type="url" inputMode="url" className={inputCls} placeholder="https://" value={d.links[k]}
            onChange={(e) => setD({ ...d, links: { ...d.links, [k]: e.target.value } })}
            aria-invalid={!!errors[`links.${k}`]} aria-describedby={errors[`links.${k}`] ? `links-${k}-err` : undefined}
          />
        </Field>
      ))}

      <div className="flex flex-wrap items-center gap-4 md:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Save profile
        </button>
        <p role="status" aria-live="polite" className={cn("text-sm font-semibold", status?.ok ? "text-green-ink" : "text-red-ink")}>
          {status?.text}
        </p>
      </div>
    </form>
  );
}
