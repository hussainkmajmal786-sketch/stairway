import type { TicketDetail } from "@/lib/registration/tickets";

/** QR quiet zone in modules (ISO/IEC 18004 asks for 4); qrRows() has none, so every renderer adds it. */
export const QUIET_ZONE = 4;

/** What the ticket page shows as the door pass. Only confirmed seats get one (waitlisted/pending rows carry a code too). */
export type DoorPass = { kind: "qr" } | { kind: "token"; token: string } | { kind: "none" };

export function doorPass(t: Pick<TicketDetail, "status" | "ticketType" | "token">): DoorPass {
  if (t.status !== "confirmed") return { kind: "none" };
  // A token event whose seat somehow has no token number still gets a scannable pass.
  if (t.ticketType === "token" && t.token) return { kind: "token", token: t.token };
  return { kind: "qr" };
}

/** Why the registration can't be cancelled here, mirroring cancel_registration's refusals; null when it can. */
export type CancelBlock = "checked_in" | "pending_payment" | "paid" | "started";

export const CANCEL_BLOCK_COPY: Record<CancelBlock, string> = {
  checked_in: "You've already checked in, so this registration can't be cancelled.",
  pending_payment: "This registration is waiting for payment. Contact the organisers to change it.",
  paid: "Paid registrations are cancelled by the organisers. Contact us about a refund.",
  started: "This session has already started, so the registration can't be cancelled any more.",
};

export function cancelBlock(
  t: Pick<TicketDetail, "status" | "checkedInAt"> & { event: Pick<TicketDetail["event"], "start" | "pricePaise"> },
  now: number,
): CancelBlock | null {
  if (t.checkedInAt) return "checked_in";
  if (t.status !== "confirmed" && t.status !== "waitlisted") return "pending_payment";
  // The RPC checks the amount paid; in Phase 3 only free events take registrations, so price > 0 means paid.
  if (t.event.pricePaise > 0) return "paid";
  if (!(Date.parse(t.event.start) > now)) return "started";
  return null;
}

/** Download name built only from the slug's safe characters (never the ticket code or user input). */
export function ticketFilename(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `stairway-${safe || "session"}-ticket.png`;
}
