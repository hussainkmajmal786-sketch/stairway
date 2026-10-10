export interface HoldRemaining {
  expired: boolean;
  totalSeconds: number;
  /** "m:ss" */
  label: string;
}

/** Time left on a seat hold. Invalid timestamps read as expired (the server is the authority anyway). */
export function holdRemaining(expiresAt: string, now: number): HoldRemaining {
  const end = Date.parse(expiresAt);
  const total = Number.isFinite(end) ? Math.max(0, Math.floor((end - now) / 1000)) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return { expired: total === 0, totalSeconds: total, label: `${m}:${String(s).padStart(2, "0")}` };
}

/** Screen-reader text for a hold: whole minutes (rounded up), so it changes at most once a minute. */
export function holdAnnouncement(r: HoldRemaining): string {
  if (r.expired) return "Seat hold expired. Refresh the page to start again.";
  const minutes = Math.ceil(r.totalSeconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"} left to pay`;
}
