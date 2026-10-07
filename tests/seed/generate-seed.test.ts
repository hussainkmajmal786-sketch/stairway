import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeedSql, registrationConfigSql, sqlJson, sqlLiteral, validateSeedInputs } from "@/scripts/generate-seed";

describe("sqlLiteral", () => {
  it("escapes single quotes and handles null", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral(null)).toBe("null");
    expect(sqlLiteral(undefined)).toBe("null");
  });
  it("renders numbers, booleans, text arrays and json", () => {
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(true)).toBe("true");
    expect(sqlLiteral(["a", "b'c"])).toBe("array['a','b''c']::text[]");
    expect(sqlLiteral({ a: "x'y" })).toBe(`'{"a":"x''y"}'::jsonb`);
  });
});

describe("sqlJson", () => {
  it("renders empty arrays as jsonb, not text[]", () => {
    expect(sqlJson([])).toBe("'[]'::jsonb");
  });
});

describe("buildSeedSql", () => {
  const sql = buildSeedSql();

  it("seeds all five societies and twenty tracks", () => {
    for (const slug of ["main", "cs", "ias", "ras", "wie"]) expect(sql).toContain(`'${slug}'`);
    expect(sql.match(/insert into public\.tracks/g)?.length).toBe(20);
  });

  const statements = sql.split(";\n");
  const eventInserts = statements.filter((st) => st.includes("insert into public.events "));
  const eventInsert = (slug: string) => {
    const st = eventInserts.find((x) => x.includes(`'${slug}'`));
    if (!st) throw new Error(`no event insert for ${slug}`);
    return st;
  };

  it("maps every existing session onto a society stairway", () => {
    expect(eventInsert("seeing-machines")).toContain("where s.slug = 'ras'");
  });

  it("flags only the summit as finale", () => {
    const finales = eventInserts.filter((st) => st.includes("'published', true,"));
    expect(finales).toHaveLength(1);
    expect(finales[0]).toContain("'the-summit'");
  });

  it("renders agenda, resources and winners as jsonb in every event insert", () => {
    expect(eventInserts).toHaveLength(16);
    for (const st of eventInserts) {
      expect(st).toMatch(/\]'::jsonb, array\[/); // agenda then outcomes
      expect(st).toMatch(/'published', (true|false), '\{.*\}'::jsonb, '\[.*\]'::jsonb, '\[.*\]'::jsonb, (null|'[^']+')\s+from public\.societies/);
    }
  });

  it("seeds 8 gallery items and only references existing speakers", () => {
    expect(statements.filter((st) => st.includes("insert into public.gallery_items"))).toHaveLength(8);
    const seeded = new Set([...sql.matchAll(/insert into public\.speakers [^\n]*values \('([^']+)'/g)].map((m) => m[1]));
    expect(seeded.size).toBe(8);
    const referenced = [...sql.matchAll(/and sp\.slug = '([^']+)'/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const r of referenced) expect(seeded.has(r)).toBe(true);
  });

  it("publishes the four WIE sessions", () => {
    for (const slug of ["wie-ai-healthtech", "wie-designing-ai-for-everyone", "wie-ai-for-good", "wie-lead-with-ai"])
      expect(sql).toContain(`'${slug}'`);
  });

  it("applies the Phase 3 registration config", () => {
    expect(eventInsert("wie-ai-healthtech")).toContain(", 'token', 'WIE-01', ");
    expect(eventInsert("seeing-machines")).toContain('"id":"laptop"');
    expect(eventInsert("language-and-machines")).toContain("'2026-10-20T09:00:00+05:30'");
    expect(eventInsert("ai-unlocked")).toContain(", 'qr', 'MAIN-01', ");
  });

  it("is idempotent (truncates content tables first)", () => {
    const firstCode = sql.split("\n").find((l) => l.trim() !== "" && !l.startsWith("--"));
    expect(firstCode).toBe("begin;");
    expect(sql.startsWith("--")).toBe(true);
    expect(sql).toMatch(/NEVER run it against a database holding real registrations/);
    expect(sql).toContain("truncate table public.event_speakers, public.gallery_items, public.events");
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});

describe("registrationConfigSql", () => {
  it("is exactly the committed registration_seed_config migration", () => {
    const dir = path.resolve(process.cwd(), "supabase/migrations");
    const file = readdirSync(dir).find((f) => f.endsWith("_registration_seed_config.sql"));
    expect(file).toBeDefined();
    expect(readFileSync(path.join(dir, file!), "utf8").replace(/\r\n/g, "\n")).toBe(registrationConfigSql());
  });
  it("never truncates or inserts", () => {
    expect(registrationConfigSql()).not.toMatch(/truncate|insert|delete/i);
  });
});

describe("validateSeedInputs", () => {
  const societies = [{ slug: "wie", tracks: ["AI × HealthTech"] }];
  const ok = { slug: "e", society: "wie", track: "AI × HealthTech", speakerIds: ["a"] };
  const run = (e: typeof ok, steps: (n: number) => string | undefined = () => "e") =>
    validateSeedInputs([e], new Set(["a"]), societies, [{ id: "g1", step: 1 }], steps);

  it("accepts valid input", () => expect(() => run(ok)).not.toThrow());
  it("rejects a track outside the society", () =>
    expect(() => run({ ...ok, track: "Nope" })).toThrow(/not a track of society/));
  it("rejects unknown speakers", () =>
    expect(() => run({ ...ok, speakerIds: ["zzz"] })).toThrow(/unknown speaker "zzz"/));
  it("rejects gallery items with no matching event", () =>
    expect(() => run(ok, () => undefined)).toThrow(/does not resolve to an event/));
});

describe("committed supabase/seed.sql", () => {
  it("is up to date with the generator (run `npm run seed:generate`)", () => {
    const committed = readFileSync(path.resolve(process.cwd(), "supabase/seed.sql"), "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(buildSeedSql());
  });
});
