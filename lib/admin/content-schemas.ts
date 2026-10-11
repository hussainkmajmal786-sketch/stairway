import { z } from "zod";

// Event content blocks stored as jsonb / text[]. Every schema is strict and the stored value is rebuilt from the
// parsed data (no passthrough of unknown keys). Lengths are caps, not the database's limits (it has none).

const trimmed = (min: number, max: number, what: string) =>
  z.string().trim().min(min, `${what} is required.`).max(max, `${what} is too long (max ${max} characters).`);
const https = (max = 500) =>
  z.string().trim().max(max, `The link is too long (max ${max} characters).`).refine(
    (s) => {
      if (!s.startsWith("https://")) return false;
      try {
        const u = new URL(s);
        return u.protocol === "https:" && u.username === "" && u.password === "";
      } catch {
        return false;
      }
    },
    "Use a full https:// link.",
  );

export const AgendaSchema = z
  .array(
    z.strictObject({
      time: trimmed(1, 20, "The time"),
      title: trimmed(1, 120, "The title"),
      detail: z.string().trim().max(400, "The detail is too long (max 400 characters).").optional(),
    }),
  )
  .max(30, "At most 30 agenda items.");
export type Agenda = z.infer<typeof AgendaSchema>;

/** outcomes / prerequisites / bring */
export const ListSchema = z.array(trimmed(1, 120, "Each item")).max(20, "At most 20 items.");

// "" means "not set" (the form sends empty inputs); it is dropped when stored.
const optionalHttps = z.union([z.literal(""), https()]).optional();
export const ResourcesSchema = z.strictObject({
  slides: optionalHttps,
  code: optionalHttps,
  notebook: optionalHttps,
  recording: optionalHttps,
  reading: z.array(z.strictObject({ label: trimmed(1, 80, "The label"), href: https() })).max(20, "At most 20 reading links.").optional(),
});

export const WinnersSchema = z
  .array(
    z.strictObject({
      place: trimmed(1, 40, "The place"),
      team: trimmed(1, 80, "The team"),
      project: z.string().trim().max(120, "The project is too long (max 120 characters)."),
    }),
  )
  .max(10, "At most 10 winners.");

/** Rebuilt for storage: empty optional strings and empty lists are dropped so the stored JSON stays minimal. */
export function agendaToStored(items: Agenda): { time: string; title: string; detail?: string }[] {
  return items.map((i) => ({ time: i.time, title: i.title, ...(i.detail ? { detail: i.detail } : {}) }));
}

export function resourcesToStored(r: z.infer<typeof ResourcesSchema>) {
  const out: Record<string, string | { label: string; href: string }[]> = {};
  for (const k of ["slides", "code", "notebook", "recording"] as const) if (r[k]) out[k] = r[k];
  if (r.reading && r.reading.length > 0) out.reading = r.reading.map((x) => ({ label: x.label, href: x.href }));
  return out;
}
