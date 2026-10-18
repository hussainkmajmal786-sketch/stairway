import { z } from "zod";

export const AUDIT_PAGE_SIZE = 50;
const SAFE = /[^A-Za-z0-9_.\-]/g;

export interface AuditFilters {
  actor: string | null;
  action: string | null;
  targetType: string | null;
  from: string | null; // ISO instant (start of day, Asia/Kolkata)
  to: string | null; // ISO instant, exclusive (start of next day)
  page: number;
}

const one = (v: unknown): string | undefined => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const istStart = (d: string, plusDays = 0): string | null => {
  const t = Date.parse(`${d}T00:00:00+05:30`);
  return Number.isNaN(t) ? null : new Date(t + plusDays * 86_400_000).toISOString();
};

/** Query-string filters -> a bounded, injection-safe filter set. Anything malformed is dropped, never thrown. */
export function parseAuditFilters(sp: Record<string, unknown>): AuditFilters {
  const clean = (v: string | undefined, max: number) => {
    const s = (v ?? "").trim().replace(SAFE, "").slice(0, max);
    return s.length > 0 ? s : null;
  };
  const uuid = z.uuid().safeParse((one(sp.actor) ?? "").trim());
  const fromRaw = day.safeParse(one(sp.from));
  const toRaw = day.safeParse(one(sp.to));
  const page = Number.parseInt(one(sp.page) ?? "1", 10);
  return {
    actor: uuid.success ? uuid.data : null,
    action: clean(one(sp.action), 60),
    targetType: clean(one(sp.target), 40),
    from: fromRaw.success ? istStart(fromRaw.data) : null,
    to: toRaw.success ? istStart(toRaw.data, 1) : null,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/** Inclusive row range for `.range()`: one extra row tells the page whether a next page exists. */
export function auditRange(page: number): [number, number] {
  const start = (page - 1) * AUDIT_PAGE_SIZE;
  return [start, start + AUDIT_PAGE_SIZE]; // inclusive -> PAGE_SIZE + 1 rows
}

/** A summary as plain text pairs (rendered escaped by React). Values are numbers/booleans/arrays/objects only. */
export function summaryPairs(summary: unknown): { key: string; value: string }[] {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return [];
  return Object.entries(summary as Record<string, unknown>)
    .slice(0, 20)
    .map(([key, v]) => ({
      key: key.slice(0, 40),
      value: (typeof v === "string" ? v : JSON.stringify(v) ?? "").slice(0, 200),
    }));
}
