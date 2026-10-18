import { describe, expect, it } from "vitest";
import { claimErrorCopy, isVerifiedOn, parseMembership, renewalState, todayIST, type MembershipView } from "@/lib/community/membership";

const v = (over: Partial<MembershipView>): MembershipView => ({
  status: "verified", verified: true, expired: false, pending: false, verifiedUntil: "2027-01-01", daysLeft: 100, memberNumber: "", rejectReason: null, ...over,
});

describe("parseMembership", () => {
  it("defaults to none on junk", () => {
    for (const j of [null, undefined, 5, "x", {}, { status: "bogus" }, { status: "verified", days_left: "soon" }]) {
      expect(parseMembership(j).status).toBe("none");
      expect(parseMembership(j).verified).toBe(false);
    }
  });
  it("maps a verified row", () => {
    const m = parseMembership({ status: "verified", verified: true, verified_until: "2027-05-01", days_left: 20, member_number: "12345678", pending: true });
    expect(m).toMatchObject({ verified: true, verifiedUntil: "2027-05-01", daysLeft: 20, memberNumber: "12345678", pending: true });
  });
  it("keeps the reject reason", () => {
    expect(parseMembership({ status: "rejected", reject_reason: "unreadable" }).rejectReason).toBe("unreadable");
    expect(parseMembership({ status: "rejected", reject_reason: "weird" }).status).toBe("none");
  });
});

describe("renewalState", () => {
  it("has exact boundaries", () => {
    expect(renewalState(v({ daysLeft: 31 }))).toBe("ok");
    expect(renewalState(v({ daysLeft: 30 }))).toBe("soon");
    expect(renewalState(v({ daysLeft: 0 }))).toBe("soon");
    expect(renewalState(v({ daysLeft: -1, verified: false, expired: true }))).toBe("expired");
    expect(renewalState(v({ status: "none", verified: false, daysLeft: null }))).toBe("none");
  });
});

describe("isVerifiedOn / todayIST", () => {
  it("is computed at read time", () => {
    expect(isVerifiedOn("2026-10-18", "2026-10-18")).toBe(true);
    expect(isVerifiedOn("2026-10-17", "2026-10-18")).toBe(false);
    expect(isVerifiedOn(null, "2026-10-18")).toBe(false);
  });
  it("uses the IST date", () => {
    expect(todayIST(Date.UTC(2026, 9, 17, 19, 0))).toBe("2026-10-18");
    expect(todayIST(Date.UTC(2026, 9, 17, 17, 0))).toBe("2026-10-17");
  });
});

describe("claimErrorCopy", () => {
  it("covers current codes, has no removed unavailable code and leaks no roster info", () => {
    for (const c of ["invalid_number", "invalid_proof", "not_onboarded", "proof_required", "rate_limited", "name_locked"]) {
      expect(claimErrorCopy(c)).not.toMatch(/Something went wrong/);
      expect(claimErrorCopy(c)).not.toMatch(/roster|already (taken|used|verified)|another account/i);
    }
    expect(claimErrorCopy("unavailable")).toMatch(/Something went wrong/);
    expect(claimErrorCopy("zzz")).toMatch(/Something went wrong/);
  });
});
