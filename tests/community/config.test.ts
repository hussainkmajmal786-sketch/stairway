import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PRESCREEN_MODEL, formsHashSalt, prescreenConfig } from "@/lib/community/config";
import { callVision } from "@/lib/community/prescreen";

const KEY = "k".repeat(24);
describe("prescreenConfig", () => {
  it("is disabled without the flag, without the key and with a short key", () => {
    expect(prescreenConfig({ ANTHROPIC_API_KEY: KEY })).toEqual({ enabled: false });
    expect(prescreenConfig({ IEEE_PRESCREEN_ENABLED: "true" })).toEqual({ enabled: false });
    expect(prescreenConfig({ IEEE_PRESCREEN_ENABLED: "true", ANTHROPIC_API_KEY: "short" })).toEqual({ enabled: false });
    expect(prescreenConfig({ IEEE_PRESCREEN_ENABLED: "1", ANTHROPIC_API_KEY: KEY })).toEqual({ enabled: false });
  });
  it("enables with flag + key and defaults the model", () => {
    expect(prescreenConfig({ IEEE_PRESCREEN_ENABLED: "true", ANTHROPIC_API_KEY: KEY })).toEqual({ enabled: true, apiKey: KEY, model: DEFAULT_PRESCREEN_MODEL });
    const c = prescreenConfig({ IEEE_PRESCREEN_ENABLED: "true", ANTHROPIC_API_KEY: KEY, IEEE_PRESCREEN_MODEL: "claude-sonnet-5-5" });
    expect(c.enabled && c.model).toBe("claude-sonnet-5-5");
    const bad = prescreenConfig({ IEEE_PRESCREEN_ENABLED: "true", ANTHROPIC_API_KEY: KEY, IEEE_PRESCREEN_MODEL: "x; drop" });
    expect(bad.enabled && bad.model).toBe(DEFAULT_PRESCREEN_MODEL);
  });
  it("never calls fetch when disabled", async () => {
    const spy = vi.fn();
    const cfg = prescreenConfig({});
    if (cfg.enabled) await callVision(cfg, "https://x.test/a.png", spy as never);
    expect(cfg.enabled).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("formsHashSalt", () => {
  it("needs 16+ chars", () => {
    expect(formsHashSalt({})).toBeNull();
    expect(formsHashSalt({ COMMUNITY_HASH_SALT: "short" })).toBeNull();
    expect(formsHashSalt({ COMMUNITY_HASH_SALT: "s".repeat(16) })).toBe("s".repeat(16));
  });
});
