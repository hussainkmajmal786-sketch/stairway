import { SOCIAL_KEYS, type SocialKey } from "./options";

/** Experience row as edited in the form (camelCase, "" for an open end date). */
export interface ExperienceRow {
  id?: string; title: string; organization: string; startDate: string; endDate: string; description: string;
}
export interface ExperienceDbRow {
  id: string; title: string; organization: string; start_date: string; end_date: string | null; description: string;
}

export function experienceFromDb(rows: ExperienceDbRow[]): ExperienceRow[] {
  return rows.map((d) => ({
    id: d.id, title: d.title, organization: d.organization,
    startDate: d.start_date, endDate: d.end_date ?? "", description: d.description,
  }));
}

/** Normalises the `profiles.links` jsonb into one string per known social key (unknown keys and non-strings dropped). */
export function linksFromDb(raw: unknown): Record<SocialKey, string> {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    SOCIAL_KEYS.map((k) => [k, typeof obj[k] === "string" ? (obj[k] as string) : ""]),
  ) as Record<SocialKey, string>;
}

export const MAX_SKILLS = 30;
export const MAX_SKILL_LEN = 30;

/** Normalises a typed skill (trim, collapse whitespace). */
export const normaliseSkill = (s: string) => s.trim().replace(/\s+/g, " ");

/** Why a typed skill can't be added, or null if it can (duplicates are not an error; they're just ignored). */
export function skillDraftError(draft: string, skills: string[]): string | null {
  const s = normaliseSkill(draft);
  if (!s) return null;
  if (s.length > MAX_SKILL_LEN) return `Keep each skill under ${MAX_SKILL_LEN} characters.`;
  if (skills.some((x) => x.toLowerCase() === s.toLowerCase())) return null;
  if (skills.length >= MAX_SKILLS) return `Up to ${MAX_SKILLS} skills.`;
  return null;
}

/** Cleans stored skills: normalised, non-empty, case-insensitively unique (first spelling wins). */
export function dedupeSkills(skills: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skills ?? []) {
    const s = normaliseSkill(raw);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * After a save resolves, take the saved (normalised) value for each field the user did NOT touch while
 * the save was in flight; keep the current value for fields edited since `sent` was submitted.
 * Values are compared by identity, which works because every edit replaces the field's value.
 */
export function mergeSaved<T extends object>(current: T, sent: T, saved: Partial<T>): T {
  const out = { ...current };
  for (const k of Object.keys(saved) as (keyof T)[]) {
    if (Object.is(current[k], sent[k])) out[k] = saved[k] as T[keyof T];
  }
  return out;
}

/** Drops empty links so the stored jsonb only holds links the user actually set. */
export function linksToDb(links: Record<SocialKey, string>): Partial<Record<SocialKey, string>> {
  return Object.fromEntries(SOCIAL_KEYS.filter((k) => links[k]).map((k) => [k, links[k]]));
}
