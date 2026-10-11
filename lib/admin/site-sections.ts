/** Sections of /admin/site (super admins only). Static; the section key never selects a table by itself. */
export const SITE_SECTIONS = [
  { key: "settings", label: "Announcement and settings", help: "Announcement bar, tagline, contact details and links." },
  { key: "stats", label: "Numbers", help: "The figures shown on the home page." },
  { key: "sponsors", label: "Sponsors", help: "Sponsor logos grouped by tier." },
  { key: "team", label: "Team", help: "People shown on the team page." },
  { key: "faq", label: "FAQ", help: "Questions and answers." },
  { key: "testimonials", label: "Testimonials", help: "Attendee quotes." },
  { key: "speakers", label: "Shared speakers", help: "Speakers that appear for every society." },
] as const;
export type SiteSectionKey = (typeof SITE_SECTIONS)[number]["key"];

export function parseSection(v: unknown): SiteSectionKey | null {
  return SITE_SECTIONS.find((s) => s.key === v)?.key ?? null;
}
