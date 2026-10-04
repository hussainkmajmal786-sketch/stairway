import { describe, expect, it } from "vitest";
import { buildSeedSql, sqlJson, sqlLiteral } from "@/scripts/generate-seed";

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

  it("maps every existing session onto a society stairway", () => {
    expect(sql).toMatch(/'seeing-machines'[\s\S]*?where s\.slug = 'ras'/);
    expect(sql).toMatch(/'the-summit'[\s\S]*?true/); // is_finale
  });

  it("publishes the four WIE sessions", () => {
    for (const slug of ["wie-ai-healthtech", "wie-designing-ai-for-everyone", "wie-ai-for-good", "wie-lead-with-ai"])
      expect(sql).toContain(`'${slug}'`);
  });

  it("writes empty winners as jsonb", () => {
    expect(sql).not.toMatch(/'published', (true|false), '\{[^']*\}'::jsonb, array\[\]::text\[\]/);
  });

  it("is idempotent (truncates content tables first)", () => {
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql).toContain("truncate table public.event_speakers, public.gallery_items, public.events");
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
