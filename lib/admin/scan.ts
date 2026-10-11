import type { CheckInResult } from "./registration-actions";

// Pure helpers for the door scanner (no DOM, no camera): code classification, double-scan debounce, the result
// copy and the camera state machine. The camera and decoding live in components/admin/CheckInScanner.tsx.

export type ParsedScan = { kind: "qr"; code: string } | { kind: "token"; code: string } | { kind: "invalid" };

const QR = /^[A-Z2-7]{26}$/;
const TOKEN = /^([A-Z0-9]+-)*[0-9]{1,6}$/;

/** A ticket QR (26 base32 chars) or a typed door token (`RAS-05-0042`, `42`). Anything else is rejected locally. */
export function parseScan(raw: string): ParsedScan {
  if (typeof raw !== "string") return { kind: "invalid" };
  const code = raw.trim().toUpperCase();
  if (code.length === 0 || code.length > 64) return { kind: "invalid" };
  if (QR.test(code)) return { kind: "qr", code };
  if (TOKEN.test(code)) return { kind: "token", code };
  return { kind: "invalid" };
}

/** The same code inside the window is ignored (the camera sees one QR for many frames); a different code passes. */
export class ScanDebounce {
  private last: { code: string; at: number } | null = null;
  constructor(private readonly windowMs = 3000) {}

  accept(code: string, now: number): boolean {
    if (this.last && this.last.code === code && now - this.last.at < this.windowMs) return false;
    this.last = { code, at: now };
    return true;
  }
}

export type Tone = "success" | "warn" | "error" | "confirm";
export interface Presented {
  tone: Tone;
  title: string;
  detail: string;
  sticky: boolean;
}

const istTime = (iso: string | undefined) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(d);
};

/** Result copy for the panel. Unknown results are an error: nobody is ever shown as checked in by accident. */
export function presentResult(r: CheckInResult): Presented {
  const who = r.attendee?.full_name?.trim() || "This person";
  switch (r.result) {
    case "checked_in":
      return { tone: "success", title: "Checked in", detail: who, sticky: false };
    case "already_checked_in": {
      const t = istTime(r.checked_in_at);
      return {
        tone: "warn",
        title: t ? `Already checked in at ${t}` : "Already checked in",
        detail: `${who} was already scanned in. Do not let a second person in on this ticket.`,
        sticky: true,
      };
    }
    case "confirm_identity":
      return { tone: "confirm", title: "Confirm identity", detail: `Is this ${who}?`, sticky: true };
    case "not_confirmed":
      return {
        tone: "error",
        title: r.status === "waitlisted" ? "Not confirmed (waitlisted)" : "Not confirmed",
        detail: `${who} does not have a confirmed seat.`,
        sticky: true,
      };
    case "not_found":
      return { tone: "error", title: "Not found", detail: "No registration matches that code for this session.", sticky: true };
    case "event_not_open":
      return { tone: "error", title: "Not open yet", detail: "This session is not open for check-in.", sticky: true };
    case "outside_window":
      return {
        tone: "error",
        title: "Outside the check-in window",
        detail: "Check-in opens 24 hours before the session starts and closes 24 hours after it ends.",
        sticky: true,
      };
    case "invalid_code":
      return { tone: "error", title: "Not a valid code", detail: "Scan the ticket QR or type the token number.", sticky: true };
    default:
      return { tone: "error", title: "Something went wrong", detail: "Nobody was checked in. Try again.", sticky: true };
  }
}

// ---- camera state machine -------------------------------------------------------------------------------------

export type ScanPhase = "idle" | "starting" | "scanning" | "busy" | "result" | "denied" | "unsupported" | "error";
export type ScanEvent =
  | { type: "start" }
  | { type: "camera_ready" }
  | { type: "camera_denied" }
  | { type: "camera_unsupported" }
  | { type: "camera_error" }
  | { type: "decoded" }
  | { type: "responded" }
  | { type: "dismiss" }
  | { type: "hidden" }
  | { type: "stop" }
  | { type: "reset" };

/**
 * idle -> starting -> scanning -> busy -> result -> scanning. A code is only accepted while scanning (so the loop
 * never fires a second request while one is in flight or a result is on screen). denied / unsupported / error are
 * terminal until the user presses Start again; the manual entry stays available in every phase.
 */
export function nextPhase(phase: ScanPhase, e: ScanEvent): ScanPhase {
  switch (e.type) {
    case "start":
      return phase === "idle" || phase === "denied" || phase === "error" ? "starting" : phase;
    case "camera_ready":
      return phase === "starting" ? "scanning" : phase;
    case "camera_denied":
      return phase === "starting" ? "denied" : phase;
    case "camera_unsupported":
      return phase === "starting" || phase === "idle" ? "unsupported" : phase;
    case "camera_error":
      return phase === "starting" || phase === "scanning" || phase === "busy" ? "error" : phase;
    case "decoded":
      return phase === "scanning" ? "busy" : phase;
    case "responded":
      return phase === "busy" ? "result" : phase;
    case "dismiss":
      return phase === "result" ? "scanning" : phase;
    case "reset":
      return phase === "denied" || phase === "unsupported" || phase === "error" ? phase : "idle";
    case "hidden":
    case "stop":
      return phase === "scanning" || phase === "starting" || phase === "busy" ? "idle" : phase;
  }
}

/** Frames are inspected at most `fps` times a second (rAF fires faster). */
export function shouldDecodeFrame(now: number, lastAt: number, fps = 6): boolean {
  return now - lastAt >= 1000 / fps;
}
