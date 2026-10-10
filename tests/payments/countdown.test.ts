import { describe, expect, it } from "vitest";
import { holdAnnouncement, holdRemaining } from "@/lib/payments/countdown";

const END = "2026-10-10T10:15:00Z";
const at = (iso: string) => Date.parse(iso);

describe("holdRemaining", () => {
  it("counts down in m:ss, flooring seconds", () => {
    expect(holdRemaining(END, at("2026-10-10T10:00:00Z"))).toEqual({ expired: false, totalSeconds: 900, label: "15:00" });
    expect(holdRemaining(END, at("2026-10-10T10:14:55.900Z"))).toEqual({ expired: false, totalSeconds: 4, label: "0:04" });
  });
  it("is expired at and after the end, and for an invalid timestamp", () => {
    expect(holdRemaining(END, at(END)).expired).toBe(true);
    expect(holdRemaining(END, at("2026-10-10T11:00:00Z"))).toEqual({ expired: true, totalSeconds: 0, label: "0:00" });
    expect(holdRemaining("nope", 0).expired).toBe(true);
  });
  it("treats the last partial second as expired (never shows 0:00 while still live)", () => {
    expect(holdRemaining(END, at("2026-10-10T10:14:59.500Z"))).toEqual({ expired: true, totalSeconds: 0, label: "0:00" });
  });
});

describe("holdAnnouncement (screen-reader text, changes at most once a minute)", () => {
  const say = (iso: string) => holdAnnouncement(holdRemaining(END, at(iso)));
  it("announces whole minutes, rounding up", () => {
    expect(say("2026-10-10T10:00:00Z")).toBe("15 minutes left to pay");
    expect(say("2026-10-10T10:00:30Z")).toBe("15 minutes left to pay");
    expect(say("2026-10-10T10:14:00Z")).toBe("1 minute left to pay");
    expect(say("2026-10-10T10:14:58Z")).toBe("1 minute left to pay");
  });
  it("says when the hold has expired", () => {
    expect(say(END)).toBe("Seat hold expired. Refresh the page to start again.");
  });
});
