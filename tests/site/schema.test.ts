import { describe, expect, it } from "vitest";
import { SettingsSchema } from "@/lib/site/schema";
import { event } from "@/supabase/seed-data/event";

describe("SettingsSchema", () => {
  it("accepts the current site settings", () => {
    expect(SettingsSchema.parse(event).name).toBe("st(AI)rway");
  });
  it("keeps empty and GA/Ads ids, and turns anything else into \"\" (GA off)", () => {
    const ga = (gaId: string) => SettingsSchema.parse({ ...event, gaId }).gaId;
    for (const ok of ["", "G-ABC123", "GT-XYZ", "AW-123456789", "UA-12345-1"]) expect(ga(ok)).toBe(ok);
    for (const bad of ["G-X&l=foo", "g-abc", "G-", "foo", "G-1</script>"]) expect(ga(bad)).toBe("");
  });
  it("rejects a non-URL siteUrl", () => {
    expect(() => SettingsSchema.parse({ ...event, siteUrl: "nope" })).toThrow();
  });
});
