import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ghostWord } from "@/lib/design/ghost";
import { eventRows } from "@/scripts/generate-seed";

// The same rows scripts/generate-seed.ts writes into supabase/seed.sql (no hand-kept copy to drift).
const ROWS = eventRows();
const SESSIONS = new Map(ROWS.map((e) => [e.slug, { step: e.step, finale: e.finale }]));

describe("session ghost words for the seeded sessions", () => {
  const ghost = (slug: string) => {
    const e = SESSIONS.get(slug);
    if (!e) throw new Error(`not seeded: ${slug}`);
    return ghostWord({ kind: "session", step: e.step, finale: e.finale });
  };

  it("labels ordinary sessions STEP NN", () => {
    expect(ghost("seeing-machines")).toBe("STEP 01");
    expect(ghost("wie-lead-with-ai")).toBe("STEP 04");
  });

  it("labels the finale SUMMIT, and only the finale", () => {
    expect(ghost("the-summit")).toBe("SUMMIT");
    expect([...SESSIONS.keys()].filter((s) => ghost(s) === "SUMMIT")).toEqual(["the-summit"]);
  });

  it("never yields an empty or unpadded word for any seeded session", () => {
    expect(SESSIONS.size).toBe(ROWS.length); // slugs are unique
    for (const slug of SESSIONS.keys()) expect(ghost(slug)).toMatch(/^(STEP \d{2,}|SUMMIT)$/);
  });

  it("covers exactly the sessions in the committed supabase/seed.sql, with the same finale flag", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../supabase/seed.sql"), "utf8");
    const inserts = sql.split("\n").filter((l) => l.startsWith("select s.id, t.id, "));
    // select s.id, t.id, <step>, '<slug>', … 'published', <is_finale>, …
    const seeded = inserts.map((l) => {
      const m = /^select s\.id, t\.id, (\d+), '([^']+)',.*'published', (true|false),/.exec(l);
      if (!m) throw new Error(`unreadable seed row: ${l.slice(0, 80)}`);
      return { slug: m[2], step: Number(m[1]), finale: m[3] === "true" };
    });
    expect(seeded.length).toBeGreaterThan(0);
    expect(new Map(seeded.map((r) => [r.slug, { step: r.step, finale: r.finale }]))).toEqual(SESSIONS);
  });
});
