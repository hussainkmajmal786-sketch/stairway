import { describe, expect, it } from "vitest";
import { handleFromUrl, heroHandles, RULE_HEAD_FALLBACK, ruleHead } from "@/lib/design/hero";

describe("ruleHead", () => {
  const ev = { step: 4, start: "2026-10-17T04:00:00Z" }; // Sat 17 Oct, 09:30 IST

  it("reads Step 04 opens Sat 17 Oct before the start", () => {
    expect(ruleHead(ev, Date.parse("2026-10-09T00:00:00Z"))).toEqual({ lead: "Step 04", verb: "opens", when: "Sat 17 Oct" });
  });

  it("switches the verb once the step has started", () => {
    expect(ruleHead(ev, Date.parse("2026-10-17T05:00:00Z")).verb).toBe("is on");
  });

  it("is on at the exact start instant and opens one millisecond before", () => {
    const start = Date.parse(ev.start);
    expect(ruleHead(ev, start).verb).toBe("is on");
    expect(ruleHead(ev, start - 1).verb).toBe("opens");
  });

  it("uses the IST calendar date (a late-evening UTC start is the next day in India)", () => {
    expect(ruleHead({ step: 12, start: "2026-10-17T20:00:00Z" }, 0)).toEqual({ lead: "Step 12", verb: "opens", when: "Sun 18 Oct" });
  });

  it("falls back to 'Next step opens soon' with no session or an unreadable date", () => {
    expect(ruleHead(null, 0)).toEqual(RULE_HEAD_FALLBACK);
    expect(ruleHead(undefined, 0)).toEqual({ lead: "Next step", verb: "opens", when: "soon" });
    expect(ruleHead({ step: 3, start: "not a date" }, 0)).toEqual(RULE_HEAD_FALLBACK);
  });
});

describe("handles row", () => {
  it("turns a profile URL into an @handle", () => {
    expect(handleFromUrl("https://instagram.com/ieeesbcek")).toBe("@ieeesbcek");
    expect(handleFromUrl("https://www.instagram.com/ieeesbcek/")).toBe("@ieeesbcek");
    expect(handleFromUrl("https://instagram.com/")).toBeNull();
    expect(handleFromUrl("not a url")).toBeNull();
    expect(handleFromUrl("")).toBeNull();
    expect(handleFromUrl("javascript:alert(1)")).toBeNull();
  });

  it("does not double a leading @ and drops invisible format characters", () => {
    expect(handleFromUrl("https://www.threads.net/@ieeesbcek")).toBe("@ieeesbcek");
    expect(handleFromUrl("https://medium.com/%40ieeesbcek")).toBe("@ieeesbcek");
    expect(handleFromUrl("https://instagram.com/ieee​sb‍cek⁠")).toBe("@ieeesbcek");
    expect(handleFromUrl("https://instagram.com/%E2%80%8Eieeesbcek%E2%80%8F")).toBe("@ieeesbcek");
    expect(handleFromUrl("https://instagram.com/@")).toBeNull();
    expect(handleFromUrl("https://instagram.com/%E2%80%8B")).toBeNull();
    expect(handleFromUrl("https://instagram.com/%E0%A4")).toBeNull(); // malformed escape
  });

  it("lists the Instagram handle and the site host", () => {
    expect(heroHandles({ social: { instagram: "https://instagram.com/ieeesbcek" }, siteUrl: "https://stairway.ieeesbcek.workers.dev" })).toEqual([
      "@ieeesbcek",
      "stairway.ieeesbcek.workers.dev",
    ]);
    expect(heroHandles({ social: { instagram: "" }, siteUrl: "https://stairway.ieeesbcek.workers.dev" })).toEqual(["stairway.ieeesbcek.workers.dev"]);
    expect(heroHandles({ social: { instagram: "" }, siteUrl: "nope" })).toEqual([]);
  });
});
