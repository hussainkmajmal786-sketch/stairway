import { describe, expect, it } from "vitest";
import { SettingsSchema } from "@/lib/site/schema";
import { event } from "@/data/event";

describe("SettingsSchema", () => {
  it("accepts the current site settings", () => {
    expect(SettingsSchema.parse(event).name).toBe("st(AI)rway");
  });
  it("rejects a non-URL siteUrl", () => {
    expect(() => SettingsSchema.parse({ ...event, siteUrl: "nope" })).toThrow();
  });
});
