import { describe, expect, it } from "vitest";
import { nextPhase, parseScan, presentResult, ScanDebounce, shouldDecodeFrame } from "@/lib/admin/scan";
import type { CheckInResult } from "@/lib/admin/registration-actions";

const QR = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, 26);

describe("parseScan", () => {
  it.each([
    [QR, { kind: "qr", code: QR }],
    [` ${QR.toLowerCase()} \n`, { kind: "qr", code: QR }],
    ["RAS-05-0042", { kind: "token", code: "RAS-05-0042" }],
    ["ras-05-42", { kind: "token", code: "RAS-05-42" }],
    ["42", { kind: "token", code: "42" }],
    ["  0007 ", { kind: "token", code: "0007" }],
  ])("accepts %j", (raw, out) => {
    expect(parseScan(raw)).toEqual(out);
  });
  it.each([
    "",
    "   ",
    "A".repeat(27),
    "https://example.com/t/ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "RAS 05 0042",
    "RAS-05-",
    "1234567", // 7 digits
    "A".repeat(65),
    "ABCDEFGHIJKLMNOPQRSTUVWXY1", // 1 is not base32
  ])("rejects %j", (raw) => {
    expect(parseScan(raw)).toEqual({ kind: "invalid" });
  });
});

describe("ScanDebounce", () => {
  it("ignores the same code inside the window and accepts it after", () => {
    const d = new ScanDebounce(3000);
    expect(d.accept("A", 0)).toBe(true);
    expect(d.accept("A", 2999)).toBe(false);
    expect(d.accept("A", 3000)).toBe(true);
  });
  it("accepts a different code immediately", () => {
    const d = new ScanDebounce(3000);
    expect(d.accept("A", 0)).toBe(true);
    expect(d.accept("B", 10)).toBe(true);
    expect(d.accept("A", 20)).toBe(true);
  });
});

const who = { registration_id: "r", full_name: "Asha K", handle: "asha", avatar_url: null, college: "CIT", token_number: 4, token_prefix: "RAS" };
describe("presentResult", () => {
  it("covers every outcome", () => {
    const outcomes: CheckInResult["result"][] = [
      "checked_in", "already_checked_in", "confirm_identity", "not_found", "not_confirmed",
      "event_not_open", "outside_window", "invalid_code",
    ];
    for (const result of outcomes) {
      const p = presentResult({ result, attendee: who, checked_in_at: "2030-01-01T05:12:00Z", status: "waitlisted" });
      expect(p.title.length, result).toBeGreaterThan(0);
      expect(p.detail.length, result).toBeGreaterThan(0);
    }
  });
  it("checked in is the only success and auto-dismisses", () => {
    expect(presentResult({ result: "checked_in", attendee: who })).toMatchObject({ tone: "success", sticky: false });
  });
  it("already checked in is a sticky warning with the time in IST", () => {
    const p = presentResult({ result: "already_checked_in", attendee: who, checked_in_at: "2030-01-01T05:12:00Z" });
    expect(p.tone).toBe("warn");
    expect(p.sticky).toBe(true);
    expect(p.title).toMatch(/10:42/);
  });
  it("confirm_identity is the confirm tone and names the person", () => {
    const p = presentResult({ result: "confirm_identity", attendee: who });
    expect(p).toMatchObject({ tone: "confirm", sticky: true });
    expect(p.detail).toContain("Asha K");
  });
  it("names the waitlist case", () => {
    expect(presentResult({ result: "not_confirmed", status: "waitlisted", attendee: who }).title).toMatch(/waitlisted/);
  });
  it("an unknown result is an error, never a success", () => {
    const p = presentResult({ result: "weird" } as never);
    expect(p.tone).toBe("error");
  });
});

describe("nextPhase", () => {
  it("walks idle -> starting -> scanning -> busy -> result -> scanning", () => {
    let p = nextPhase("idle", { type: "start" });
    expect(p).toBe("starting");
    p = nextPhase(p, { type: "camera_ready" });
    expect(p).toBe("scanning");
    p = nextPhase(p, { type: "decoded" });
    expect(p).toBe("busy");
    p = nextPhase(p, { type: "responded" });
    expect(p).toBe("result");
    p = nextPhase(p, { type: "dismiss" });
    expect(p).toBe("scanning");
  });
  it("accepts a decode only while scanning", () => {
    for (const p of ["idle", "starting", "busy", "result", "denied"] as const) {
      expect(nextPhase(p, { type: "decoded" })).toBe(p);
    }
  });
  it("permission denial and unsupported browsers leave the camera off", () => {
    expect(nextPhase("starting", { type: "camera_denied" })).toBe("denied");
    expect(nextPhase("idle", { type: "camera_unsupported" })).toBe("unsupported");
    expect(nextPhase("denied", { type: "start" })).toBe("starting");
  });
  it("hiding the page or stopping returns to idle from any live phase", () => {
    for (const p of ["starting", "scanning", "busy"] as const) expect(nextPhase(p, { type: "hidden" })).toBe("idle");
    expect(nextPhase("result", { type: "hidden" })).toBe("result");
  });
});

describe("nextPhase reset", () => {
  it("returns a result screen to idle when the camera is gone, keeping a blocked camera blocked", () => {
    expect(nextPhase("result", { type: "reset" })).toBe("idle");
    expect(nextPhase("denied", { type: "reset" })).toBe("denied");
  });
});

describe("shouldDecodeFrame", () => {
  it("throttles to about six frames a second", () => {
    expect(shouldDecodeFrame(100, 0)).toBe(false);
    expect(shouldDecodeFrame(167, 0)).toBe(true);
  });
});
