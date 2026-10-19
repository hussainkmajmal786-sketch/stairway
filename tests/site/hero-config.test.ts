import { describe, expect, it } from "vitest";
import { HERO_DEFAULTS, HeroConfigSchema, mergeHeroConfig, readHeroConfig } from "@/lib/site/schema";

describe("HeroConfigSchema (strict, on write)", () => {
  it("fills every default from an empty object", () => {
    expect(HeroConfigSchema.parse({})).toMatchObject({ preset: "cobalt", headlineMode: "auto", showStats: true, showFrameText: true });
  });
  it("accepts the four presets only", () => {
    for (const preset of ["cobalt", "ink", "daylight", "sunrise"]) expect(HeroConfigSchema.parse({ preset }).preset).toBe(preset);
    expect(() => HeroConfigSchema.parse({ preset: "neon" })).toThrow();
  });
  it("bounds the text fields (60 / 12 / 24) and trims and collapses spaces", () => {
    expect(HeroConfigSchema.parse({ headlineMode: "custom", customHeadline: "  Join   the climb  " }).customHeadline).toBe("Join the climb");
    expect(HeroConfigSchema.parse({ headlineMode: "custom", customHeadline: "x".repeat(60) }).customHeadline).toHaveLength(60);
    expect(() => HeroConfigSchema.parse({ headlineMode: "custom", customHeadline: "x".repeat(61) })).toThrow();
    expect(() => HeroConfigSchema.parse({ ghostWord: "ABCDEFGHIJKLM" })).toThrow();
    expect(HeroConfigSchema.parse({ ghostWord: " summit 24 " }).ghostWord).toBe("SUMMIT 24");
    expect(() => HeroConfigSchema.parse({ ghostWord: "climb!" })).toThrow();
    expect(() => HeroConfigSchema.parse({ primaryCta: "y".repeat(25) })).toThrow();
    expect(HeroConfigSchema.parse({ secondaryCta: "y".repeat(24) }).secondaryCta).toHaveLength(24);
  });
  it("treats blank optional fields as unset", () => {
    const c = HeroConfigSchema.parse({ ghostWord: "", primaryCta: "   ", secondaryCta: "" });
    expect(c.ghostWord).toBeUndefined();
    expect(c.primaryCta).toBeUndefined();
    expect(c.secondaryCta).toBeUndefined();
  });
  it("requires a headline in custom mode", () => {
    expect(() => HeroConfigSchema.parse({ headlineMode: "custom" })).toThrow();
    expect(() => HeroConfigSchema.parse({ headlineMode: "custom", customHeadline: "  " })).toThrow();
  });
  it("rejects control and invisible characters", () => {
    for (const bad of ["a\u0000b", "a\u0007b", "a​b", "a‮b", "a\u0085b"]) {
      expect(() => HeroConfigSchema.parse({ primaryCta: bad }), JSON.stringify(bad)).toThrow();
    }
  });
  it("rejects wrong types", () => {
    expect(() => HeroConfigSchema.parse({ showStats: "yes" })).toThrow();
    expect(() => HeroConfigSchema.parse({ primaryCta: 5 })).toThrow();
  });
  it("keeps hostile strings as plain text (escaping is the renderer's job) but within bounds", () => {
    const c = HeroConfigSchema.parse({ headlineMode: "custom", customHeadline: "<img src=x onerror=alert(1)>" });
    expect(c.customHeadline).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("readHeroConfig (tolerant, on read)", () => {
  it("returns null for nothing stored or junk", () => {
    for (const v of [undefined, null, 5, "x", [], true]) expect(readHeroConfig(v)).toBeNull();
  });
  it("an empty object means defaults", () => {
    expect(readHeroConfig({})).toMatchObject(HERO_DEFAULTS);
  });
  it("falls back per field, never throws", () => {
    const c = readHeroConfig({
      preset: "disco", headlineMode: "custom", customHeadline: "z".repeat(99), ghostWord: "no way!", primaryCta: "ok",
      secondaryCta: 12, showStats: "nope", showFrameText: false, extra: { a: 1 },
    });
    expect(c).toMatchObject({ preset: "cobalt", headlineMode: "auto", primaryCta: "ok", showStats: true, showFrameText: false });
    expect(c?.customHeadline).toBeUndefined();
    expect(c?.ghostWord).toBeUndefined();
    expect(c?.secondaryCta).toBeUndefined();
  });
  it("keeps valid values", () => {
    expect(readHeroConfig({ preset: "sunrise", headlineMode: "custom", customHeadline: "Hello", ghostWord: "go", showStats: false })).toMatchObject({
      preset: "sunrise", headlineMode: "custom", customHeadline: "Hello", ghostWord: "GO", showStats: false,
    });
  });
  it("survives hostile and prototype-polluting input", () => {
    const evil = JSON.parse('{"__proto__":{"preset":"disco"},"preset":"ink","primaryCta":"\\u0000","constructor":1}');
    expect(readHeroConfig(evil)).toMatchObject({ preset: "ink" });
    expect(readHeroConfig(evil)?.primaryCta).toBeUndefined();
    expect(({} as Record<string, unknown>).preset).toBeUndefined();
  });
});

describe("mergeHeroConfig (read-merge-validate)", () => {
  it("keeps fields it does not own and applies the validated patch over stored values", () => {
    const out = mergeHeroConfig({ legacy: "keep", preset: "ink", primaryCta: "Old" }, { primaryCta: "New", showStats: false });
    expect(out).toMatchObject({ legacy: "keep", preset: "ink", primaryCta: "New", showStats: false, headlineMode: "auto" });
  });
  it("is strict: an invalid patch throws", () => {
    expect(() => mergeHeroConfig({}, { preset: "x" })).toThrow();
    expect(() => mergeHeroConfig({ preset: "ink" }, { ghostWord: "bad word!" })).toThrow();
  });
  it("tolerates a missing or junk stored block", () => {
    expect(mergeHeroConfig(null, { preset: "daylight" })).toMatchObject({ preset: "daylight" });
    expect(mergeHeroConfig("junk", {})).toMatchObject({ preset: "cobalt" });
  });
});
