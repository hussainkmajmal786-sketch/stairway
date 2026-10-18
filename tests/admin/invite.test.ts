import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { confirmMatches, hashInviteToken, INVITE_TOKEN_RE, INVITE_TTL_MS, inviteExpiry, inviteUrl, newInviteToken } from "@/lib/admin/invite";
import { auditRange, AUDIT_PAGE_SIZE, parseAuditFilters, summaryPairs } from "@/lib/admin/audit";
import { statusRows } from "@/lib/admin/status";
import { paymentsStatus } from "@/lib/payments/config";

describe("invite tokens", () => {
  it("is 43 url-safe chars and unique", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).toMatch(INVITE_TOKEN_RE);
    expect(a).toHaveLength(43);
    expect(a).not.toBe(b);
  });
  it("hashes to deterministic 64 hex", async () => {
    const h = await hashInviteToken("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await hashInviteToken("abc")).toBe(h);
    expect(await hashInviteToken("abd")).not.toBe(h);
  });
  it("builds the link without a double slash", () => {
    expect(inviteUrl("https://x.test/", "T")).toBe("https://x.test/invite/T");
    expect(inviteUrl("https://x.test", "T")).toBe("https://x.test/invite/T");
  });
  it("expires inside the database 7 day cap", () => {
    const now = 1_000_000;
    expect(inviteExpiry(now).getTime()).toBeLessThan(now + INVITE_TTL_MS);
    expect(inviteExpiry(now).getTime()).toBeGreaterThan(now + INVITE_TTL_MS - 120_000);
  });
  it("rejects malformed tokens", () => {
    for (const t of ["", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}!`, `${"a".repeat(42)}=`]) expect(INVITE_TOKEN_RE.test(t)).toBe(false);
  });
});

describe("confirmMatches", () => {
  it("is exact and case sensitive", () => {
    expect(confirmMatches("amy", "amy")).toBe(true);
    expect(confirmMatches("Amy", "amy")).toBe(false);
    expect(confirmMatches(" amy", "amy")).toBe(false);
    expect(confirmMatches("", "")).toBe(false);
    expect(confirmMatches(1, "1")).toBe(false);
  });
});

describe("parseAuditFilters", () => {
  it("drops malformed input and clamps the page", () => {
    const f = parseAuditFilters({ actor: "nope", action: "event.%;drop", target: ["events", "x"], from: "2026-13-99x", to: "2026-10-12", page: "-3" });
    expect(f.actor).toBeNull();
    expect(f.action).toBe("event.drop");
    expect(f.targetType).toBe("events");
    expect(f.from).toBeNull();
    expect(f.to).toBe(new Date(Date.parse("2026-10-13T00:00:00+05:30")).toISOString());
    expect(f.page).toBe(1);
  });
  it("accepts a uuid actor and a day range", () => {
    const f = parseAuditFilters({ actor: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", from: "2026-10-01", page: "3" });
    expect(f.actor).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(f.from).toBe(new Date(Date.parse("2026-10-01T00:00:00+05:30")).toISOString());
    expect(f.page).toBe(3);
  });
  it("ranges one extra row and never exceeds 100 per page", () => {
    expect(AUDIT_PAGE_SIZE).toBeLessThanOrEqual(100);
    expect(auditRange(1)).toEqual([0, AUDIT_PAGE_SIZE]);
    expect(auditRange(2)[0]).toBe(AUDIT_PAGE_SIZE);
  });
  it("renders summaries as plain text pairs", () => {
    expect(summaryPairs({ op: "UPDATE", columns: ["a"], ok: true })).toEqual([
      { key: "op", value: "UPDATE" }, { key: "columns", value: '["a"]' }, { key: "ok", value: "true" },
    ]);
    expect(summaryPairs(null)).toEqual([]);
    expect(summaryPairs([1])).toEqual([]);
  });
});

describe("paymentsStatus + statusRows", () => {
  it("is all missing for an empty env", () => {
    const s = paymentsStatus({});
    expect(Object.values(s).every((v) => v === false || v === null)).toBe(true);
    expect(statusRows(s, null).every((r) => !r.ok)).toBe(true);
  });
  it("reports test/live mode and malformed key ids", () => {
    expect(paymentsStatus({ RAZORPAY_KEY_ID: "rzp_test_ABCDEFGH1234" }).keyMode).toBe("test");
    expect(paymentsStatus({ RAZORPAY_KEY_ID: "rzp_live_ABCDEFGH1234" }).keyMode).toBe("live");
    const bad = paymentsStatus({ RAZORPAY_KEY_ID: "rzp_nope_1" });
    expect(bad.keyIdPresent).toBe(false);
    expect(bad.keyMode).toBeNull();
  });
  it("never contains a secret value", () => {
    const env = {
      PAYMENTS_ENABLED: "true", RAZORPAY_KEY_ID: "rzp_test_ABCDEFGH1234", RAZORPAY_KEY_SECRET: "SECRETKEYVALUE12345",
      RAZORPAY_WEBHOOK_SECRET: "WEBHOOKSECRETVALUE1", SUPABASE_SERVICE_ROLE_KEY: "SERVICEROLEVALUE0000000000", CRON_SECRET: "c".repeat(32),
      FUND_EASY_SYNC_ENABLED: "true", FUND_EASY_SYNC_URL: "https://sync.example/x", STAIRWAY_SYNC_SECRET: "s".repeat(32),
    };
    const s = paymentsStatus(env);
    expect(s.syncConfigured).toBe(true);
    const out = JSON.stringify([s, statusRows(s, true)]);
    for (const v of Object.values(env)) if (v !== "true") expect(out).not.toContain(v);
    expect(out).not.toContain("ABCDEFGH1234");
  });
  it("maps the database flag", () => {
    const s = paymentsStatus({});
    expect(statusRows(s, true).find((r) => r.key === "db-flag")).toMatchObject({ ok: true, word: "On" });
    expect(statusRows(s, false).find((r) => r.key === "db-flag")).toMatchObject({ ok: false, word: "Off" });
    expect(statusRows(s, null).find((r) => r.key === "db-flag")?.word).toBe("Unknown");
  });
});
