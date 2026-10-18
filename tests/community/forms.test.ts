import { describe, expect, it } from "vitest";
import { CommunityFormSchema, clientIp, formVerdict, hashIp } from "@/lib/community/forms";

const base = { name: "Asha Rao", email: "Asha@Example.com", subject: "A good subject", message: "A message that is long enough.", hp: "", startedAt: 1 };
const host = { ...base, kind: "host_event", details: { event_title: "Robotics day", expected_attendees: 80, preferred_date: "2027-03-04", venue: "Hall A", website: "https://example.org/x" } };
const partner = { ...base, kind: "partner", details: { partnership_type: "sponsor" } };
const feedback = { ...base, kind: "feedback", details: { category: "complaint" } };
const anon = { kind: "feedback", anonymous: true, subject: "Subject", message: "A message that is long enough.", hp: "", startedAt: 1, details: { category: "other" } };
const ok = (v: unknown) => CommunityFormSchema.safeParse(v).success;

describe("CommunityFormSchema", () => {
  it("accepts each kind and lower-cases email", () => {
    for (const f of [host, partner, feedback, anon]) expect(ok(f)).toBe(true);
    const r = CommunityFormSchema.safeParse(host);
    expect(r.success && "email" in r.data && r.data.email).toBe("asha@example.com");
  });
  it("rejects markup and control characters", () => {
    expect(ok({ ...feedback, message: "<script>alert(1)</script> hello" })).toBe(false);
    expect(ok({ ...feedback, message: "hello there\u0007 friend" })).toBe(false);
    expect(ok({ ...feedback, message: "multi\nline is fine ok" })).toBe(true);
  });
  it("accepts https URLs only", () => {
    for (const w of ["javascript:alert(1)", "http://example.org", "ftp://example.org", "https://exa mple.org", "https://example.org/\u0001"]) {
      expect(ok({ ...host, details: { ...host.details, website: w } })).toBe(false);
    }
  });
  it("enforces lengths and details whitelist", () => {
    expect(ok({ ...feedback, subject: "ab" })).toBe(false);
    expect(ok({ ...feedback, message: "x".repeat(2001) })).toBe(false);
    expect(ok({ ...partner, details: { partnership_type: "sponsor", extra: 1 } })).toBe(false);
    expect(ok({ ...host, details: { ...host.details, expected_attendees: 0 } })).toBe(false);
    expect(ok({ ...host, details: { ...host.details, preferred_date: "2027-02-31" } })).toBe(false);
  });
  it("allows anonymous only on feedback and without contact data", () => {
    expect(ok({ ...partner, anonymous: true })).toBe(false);
    expect(ok({ ...anon, name: "Asha Rao" })).toBe(false);
    expect(ok({ ...host, anonymous: true })).toBe(false);
  });
  it("validates phone", () => {
    expect(ok({ ...feedback, phone: "+91 98765 43210" })).toBe(true);
    expect(ok({ ...feedback, phone: "abc" })).toBe(false);
    expect(ok({ ...feedback, phone: "" })).toBe(true);
  });
});

describe("formVerdict", () => {
  it("flags a filled honeypot and a fast fill", () => {
    expect(formVerdict({ hp: "x", startedAt: 0, now: 10_000 })).toBe("bot");
    expect(formVerdict({ hp: "", startedAt: 9_000, now: 10_000 })).toBe("bot");
    expect(formVerdict({ hp: "", startedAt: 7_000, now: 10_000 })).toBe("ok");
    expect(formVerdict({ hp: "", startedAt: Number.NaN, now: 10_000 })).toBe("bot");
  });
});

describe("clientIp / hashIp", () => {
  it("prefers cf-connecting-ip, then the first forwarded hop, and ignores garbage", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "cf-connecting-ip": "<script>" }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });
  it("hashes deterministically, salt-dependent, 64 hex", async () => {
    const a = await hashIp("1.2.3.4", "salt-salt-salt-salt");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp("1.2.3.4", "salt-salt-salt-salt")).toBe(a);
    expect(await hashIp("1.2.3.4", "other-salt-other-salt")).not.toBe(a);
    expect(await hashIp("1.2.3.5", "salt-salt-salt-salt")).not.toBe(a);
  });
});
