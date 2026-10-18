"use client";

import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CameraOff, Keyboard, Users } from "lucide-react";
import {
  checkInAction, type AttendeeHit, type CheckInResult,
} from "@/lib/admin/registration-actions";
import {
  nextPhase, parseScan, presentResult, ScanDebounce, shouldDecodeFrame, type Presented, type ScanPhase,
} from "@/lib/admin/scan";
import { AttendeeSearch } from "./AttendeeSearch";
import { ScanResultPanel } from "./ScanResultPanel";

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (options: { formats: string[] }) => DetectorLike;
type JsQr = (data: Uint8ClampedArray, width: number, height: number, opts?: { inversionAttempts?: string }) => { data: string } | null;
interface Req {
  code?: string;
  registrationId?: string;
  confirm?: boolean;
}

const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
const getOnline = () => navigator.onLine;

const MAX_SIDE = 640;
const AUTO_DISMISS_MS = 2500;

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported: ignore
  }
}

/**
 * Door scanner. The camera is opt-in (a button press), frames are decoded locally (BarcodeDetector, else jsQR loaded
 * on demand) and only the decoded text leaves the device. Nothing is ever marked checked in locally: every result
 * comes from the server. Manual entry and name search work with the camera blocked or unavailable.
 */
export function CheckInScanner({
  eventId, title, societyName, ticketType, tokenPrefix, backHref,
}: {
  eventId: string;
  title: string;
  societyName: string;
  ticketType: "qr" | "token";
  tokenPrefix: string;
  backHref: string;
}) {
  const [phase, dispatch] = useReducer(nextPhase, "idle" as ScanPhase);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<DetectorLike | null>(null);
  const jsqrRef = useRef<JsQr | null>(null);
  const debounce = useRef(new ScanDebounce(3000));
  const mounted = useRef(true);

  const [result, setResult] = useState<{ data: CheckInResult; presented: Presented } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [count, setCount] = useState(0);
  const [manual, setManual] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [lastReq, setLastReq] = useState<Req | null>(null);
  const [streaming, setStreaming] = useState(false);
  const reduceMotion = useSyncExternalStore(subscribeMotion, getMotion, () => false);
  const online = useSyncExternalStore(subscribeOnline, getOnline, () => true);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
    if (videoRef.current) videoRef.current.srcObject = null;
    void wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  }, []);

  const request = useCallback(
    async (req: Req) => {
      setLastReq(req);
      setPending(true);
      setError(null);
      dispatch({ type: "decoded" });
      try {
        const r = await checkInAction({ eventId, ...req });
        if (!mounted.current) return;
        if (!r.ok) {
          setResult(null);
          setError(r.error.message);
          vibrate([80, 60, 80]);
        } else {
          const presented = presentResult(r.data);
          setResult({ data: r.data, presented });
          if (r.data.result === "checked_in") {
            setCount((c) => c + 1);
            vibrate(60);
          } else {
            vibrate(presented.tone === "confirm" ? 30 : [80, 60, 80]);
          }
        }
      } catch {
        // A dropped connection never marks anyone as checked in.
        if (mounted.current) {
          setResult(null);
          setError("No connection. Nobody was checked in. Try again.");
          vibrate([80, 60, 80]);
        }
      } finally {
        if (mounted.current) {
          setPending(false);
          dispatch({ type: "responded" });
        }
      }
    },
    [eventId],
  );

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      dispatch({ type: "camera_unsupported" });
      return;
    }
    dispatch({ type: "start" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setStreaming(true);
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      await video.play();
      const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (Detector) {
        detectorRef.current = new Detector({ formats: ["qr_code"] });
      } else if (!jsqrRef.current) {
        jsqrRef.current = (await import("jsqr")).default as unknown as JsQr;
      }
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        wakeRef.current = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        // best effort only
      }
      dispatch({ type: "camera_ready" });
    } catch (e) {
      stopCamera();
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") dispatch({ type: "camera_denied" });
      else if (name === "NotFoundError" || name === "DevicesNotFoundError") dispatch({ type: "camera_unsupported" });
      else dispatch({ type: "camera_error" });
    }
  }, [stopCamera]);

  // Frame loop: only while the phase is "scanning" (so never during a request or while a result is on screen).
  useEffect(() => {
    if (phase !== "scanning") return;
    let raf = 0;
    let last = 0;
    let inFlight = false;
    let cancelled = false;

    const decode = async (): Promise<string | null> => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
      const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.max(1, Math.round(video.videoWidth * scale));
      const h = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = (canvasRef.current ??= document.createElement("canvas"));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      if (detectorRef.current) {
        const found = await detectorRef.current.detect(canvas);
        return found[0]?.rawValue ?? null;
      }
      if (jsqrRef.current) {
        const img = ctx.getImageData(0, 0, w, h);
        return jsqrRef.current(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
      }
      return null;
    };

    const tick = (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
      if (inFlight || !shouldDecodeFrame(now, last)) return;
      last = now;
      inFlight = true;
      decode()
        .then((raw) => {
          if (cancelled || !raw) return;
          const parsed = parseScan(raw);
          if (parsed.kind === "invalid") return; // some other QR in view: ignore silently
          if (!debounce.current.accept(parsed.code, Date.now())) return;
          void request({ code: parsed.code });
        })
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [phase, request]);

  // Stop the camera when the page is hidden and on unmount.
  useEffect(() => {
    mounted.current = true;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        stopCamera();
        dispatch({ type: "hidden" });
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onHide);
      stopCamera();
    };
  }, [stopCamera]);

  const next = useCallback(() => {
    setResult(null);
    setError(null);
    // The camera may have been stopped while the result was showing (page hidden): go back to the Start button.
    dispatch({ type: streamRef.current ? "dismiss" : "reset" });
  }, []);

  // Success results clear themselves; reduced-motion users keep them until they press Next.
  useEffect(() => {
    if (!result || result.presented.sticky || reduceMotion) return;
    const t = setTimeout(next, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [result, reduceMotion, next]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseScan(manual);
    if (parsed.kind === "invalid") {
      setError(null);
      setResult({ data: { result: "invalid_code" }, presented: presentResult({ result: "invalid_code" }) });
      return;
    }
    setManual("");
    void request({ code: parsed.code });
  };

  const pick = (hit: AttendeeHit) => {
    setShowSearch(false);
    void request({ registrationId: hit.id });
  };

  const cameraBlocked = phase === "denied" || phase === "unsupported" || phase === "error";
  const cameraOn = streaming;
  const showPanel = result !== null || error !== null;
  const hint = ticketType === "token" ? `Type the token number${tokenPrefix ? ` (${tokenPrefix}-0042 or 42)` : ""}.` : "Scan the ticket QR code, or type the token.";

  return (
    <div role="region" aria-label="Check-in scanner" className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-field text-paper">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b-2 border-paper bg-field p-3">
        <Link href={backHref} className="btn btn-secondary min-h-12 shrink-0">
          <ArrowLeft size={18} aria-hidden /> Back
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="mono truncate text-xs">{societyName}</p>
        </div>
        <p aria-live="polite" className="mono shrink-0 text-xs font-bold">
          {count} checked in
        </p>
      </header>

      <main className="mx-auto grid w-full max-w-xl gap-4 p-3 pb-10">
        {!online && (
          <p role="alert" className="border-2 border-ink bg-yellow p-3 font-semibold text-ink">
            You are offline. Check-ins will not work until the connection returns.
          </p>
        )}

        <div className="relative mx-auto aspect-square w-full max-w-sm border-2 border-paper bg-ink">
          <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${cameraOn ? "" : "invisible"}`} />
          {cameraOn && (
            <div aria-hidden className="pointer-events-none absolute inset-10 border-4 border-yellow" />
          )}
          {!cameraOn && (
            <div className="absolute inset-0 grid place-items-center gap-3 p-4 text-center">
              {cameraBlocked ? (
                <div className="grid justify-items-center gap-3">
                  <CameraOff size={40} aria-hidden />
                  <p role="alert" className="font-semibold">
                    {phase === "denied"
                      ? "Camera access was blocked. Allow it in the browser settings, or use the manual entry below."
                      : phase === "unsupported"
                        ? "This device has no usable camera. Use the manual entry below."
                        : "The camera could not start. Try again, or use the manual entry below."}
                  </p>
                  {phase !== "unsupported" && (
                    <button type="button" className="btn btn-secondary min-h-12" onClick={() => void startCamera()}>
                      Try the camera again
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid justify-items-center gap-3">
                  <Camera size={40} aria-hidden />
                  <button
                    type="button"
                    className="btn btn-primary min-h-12"
                    disabled={phase === "starting"}
                    onClick={() => void startCamera()}
                  >
                    {phase === "starting" ? "Starting…" : "Start camera"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="box shadow-hard grid gap-3 border-ink bg-red p-4 text-ink">
            <p className="text-lg font-semibold">{error}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-ink min-h-12"
                disabled={pending || lastReq === null}
                onClick={() => lastReq && void request(lastReq)}
              >
                Retry
              </button>
              <button type="button" className="btn btn-secondary min-h-12" onClick={next}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {result && (
          <ScanResultPanel
            presented={result.presented}
            attendee={result.data.attendee}
            pending={pending}
            onNext={next}
            onConfirm={
              result.presented.tone === "confirm" && lastReq?.code
                ? () => void request({ code: lastReq.code, confirm: true })
                : undefined
            }
          />
        )}

        {!showPanel && (
          <p aria-live="polite" className="min-h-6 text-center">
            {pending ? "Checking…" : phase === "scanning" ? "Point the camera at a ticket QR code." : hint}
          </p>
        )}

        <form onSubmit={submitManual} className="grid gap-2">
          <label htmlFor="manual-code" className="mono flex items-center gap-2 text-xs font-bold">
            <Keyboard size={16} aria-hidden /> Type a ticket code or token
          </label>
          <div className="flex gap-2">
            <input
              id="manual-code"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              className="h-12 min-w-0 flex-1 border-2 border-ink bg-white px-4 text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-yellow"
            />
            <button type="submit" className="btn btn-primary min-h-12" disabled={pending || manual.trim() === ""}>
              Check in
            </button>
          </div>
        </form>

        <div>
          <button
            type="button"
            className="btn btn-secondary min-h-12"
            aria-expanded={showSearch}
            onClick={() => setShowSearch((s) => !s)}
          >
            <Users size={18} aria-hidden /> Find by name
          </button>
          {showSearch && (
            <div className="box mt-3 p-4 text-ink">
              <AttendeeSearch eventId={eventId} disabled={pending} onPick={pick} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
