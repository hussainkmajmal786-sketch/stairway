import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

const re = new RegExp(`^${config.matcher[0]}$`);

describe("middleware matcher", () => {
  it("still runs for pages and the payment actions' pages", () => {
    for (const p of ["/", "/me/tickets", "/events/seeing-machines/register", "/api/other", "/api/payments", "/api/cron"]) {
      expect(re.test(p), p).toBe(true);
    }
  });
  it("still skips static assets", () => {
    for (const p of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/icon.svg", "/logo.png", "/robots.txt"]) {
      expect(re.test(p), p).toBe(false);
    }
  });
  it("skips the Razorpay webhook and the cron endpoint (no session refresh, less CPU)", () => {
    expect(re.test("/api/payments/webhook")).toBe(false);
    expect(re.test("/api/cron/tick")).toBe(false);
  });
});
