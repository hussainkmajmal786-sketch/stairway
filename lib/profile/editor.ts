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

/** Drops empty links so the stored jsonb only holds links the user actually set. */
export function linksToDb(links: Record<SocialKey, string>): Partial<Record<SocialKey, string>> {
  return Object.fromEntries(SOCIAL_KEYS.filter((k) => links[k]).map((k) => [k, links[k]]));
}
