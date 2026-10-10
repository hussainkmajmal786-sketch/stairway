import { describe, expect, it } from "vitest";
import { CRON_PATH, cronEnabled, cronRequest } from "@/lib/cron/request";

const SECRET = "c".repeat(32);

describe("cronEnabled", () => {
  it("needs a 32+ character secret and at least one feature flag", () => {
    expect(cronEnabled({ CRON_SECRET: SECRET, PAYMENTS_ENABLED: "true" })).toBe(true);
    expect(cronEnabled({ CRON_SECRET: SECRET, FUND_EASY_SYNC_ENABLED: "true" })).toBe(true);
    expect(cronEnabled({ CRON_SECRET: SECRET })).toBe(false);
    expect(cronEnabled({ CRON_SECRET: "short", PAYMENTS_ENABLED: "true" })).toBe(false);
    expect(cronEnabled({ PAYMENTS_ENABLED: "true" })).toBe(false);
    expect(cronEnabled({ CRON_SECRET: SECRET, PAYMENTS_ENABLED: "TRUE" })).toBe(false);
  });
});

describe("cronRequest", () => {
  it("is an authenticated POST to the tick route", () => {
    const r = cronRequest({ CRON_SECRET: SECRET });
    expect(r.method).toBe("POST");
    expect(new URL(r.url).pathname).toBe(CRON_PATH);
    expect(r.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
  });
});
