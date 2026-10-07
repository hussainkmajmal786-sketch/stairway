import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getAttendees, getMyRegistration, getMyTickets, getTicket } from "@/lib/registration/server";
import type { TicketRow } from "@/lib/registration/tickets";

const UID = "11111111-1111-4111-8111-111111111111";
const EID = "22222222-2222-4222-8222-222222222222";
const RID = "33333333-3333-4333-8333-333333333333";

type Res = { data: unknown; error: unknown };
function fakeDb(result: Res) {
  const calls: unknown[][] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return b;
    };
  }
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (ok: (v: Res) => unknown, err: (e: unknown) => unknown) => Promise.resolve(result).then(ok, err);
  // The client itself must not be thenable (it is awaited), only the query builder is.
  const db = { from: (table: string) => (calls.push(["from", table]), b) };
  vi.mocked(createClient).mockResolvedValue(db as never);
  return calls;
}

const ticketRow = (over: Partial<TicketRow> = {}): TicketRow => ({
  id: RID, status: "confirmed", waitlist_position: null, ticket_code: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", token_number: 4, checked_in_at: null,
  event: {
    id: EID, slug: "seeing-machines", title: "Seeing Machines", topic: "CV", step_number: 1,
    starts_at: "2026-10-10T04:00:00+00:00", ends_at: "2026-10-10T11:00:00+00:00", price_paise: 0,
    ticket_type: "token", token_prefix: "RAS-01", society: { short_name: "RAS", color: "green" },
  },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("server reads", () => {
  it("never queries with malformed ids", async () => {
    expect(await getMyRegistration("x", UID)).toBeNull();
    expect(await getAttendees("x")).toBeNull();
    expect(await getTicket("1 or 1=1", UID)).toBeNull();
    expect(await getMyTickets("")).toEqual([]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("getMyRegistration filters to the user's active rows", async () => {
    const calls = fakeDb({ data: { id: RID, status: "waitlisted", waitlist_position: 2 }, error: null });
    expect(await getMyRegistration(EID, UID)).toEqual({ id: RID, status: "waitlisted", waitlistPosition: 2 });
    expect(calls).toContainEqual(["eq", "user_id", UID]);
    expect(calls).toContainEqual(["in", "status", ["pending_payment", "confirmed", "waitlisted"]]);
  });

  it("getAttendees drops rows without a handle and sanitises avatars; null on error", async () => {
    fakeDb({
      data: [
        { handle: "asha", full_name: "Asha", avatar_url: "javascript:alert(1)", headline: null },
        { handle: null, full_name: "Ghost", avatar_url: null, headline: null },
      ],
      error: null,
    });
    expect(await getAttendees(EID)).toEqual([{ handle: "asha", fullName: "Asha", avatarUrl: undefined, headline: "" }]);
    const calls = fakeDb({ data: [], error: null });
    await getAttendees(EID, 500);
    expect(calls).toContainEqual(["from", "event_attendees"]);
    expect(calls).toContainEqual(["eq", "event_id", EID]);
    // Deterministic order (handle is unique) and a hard cap however large the request.
    expect(calls.filter((c) => c[0] === "order")).toEqual([["order", "full_name"], ["order", "handle"]]);
    expect(calls).toContainEqual(["limit", 24]);
    fakeDb({ data: null, error: { message: "boom" } });
    expect(await getAttendees(EID)).toBeNull();
  });

  it("getMyTickets hides tickets of invisible events and never carries ticket codes", async () => {
    fakeDb({
      data: [
        ticketRow({ id: "b", event: { ...ticketRow().event!, starts_at: "2026-11-01T04:00:00Z" } }),
        ticketRow({ id: "a" }),
        ticketRow({ id: "hidden", event: null }),
      ],
      error: null,
    });
    const list = await getMyTickets(UID);
    expect(list.map((t) => t.id)).toEqual(["a", "b"]);
    expect(JSON.stringify(list)).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(list[0].token).toBe("RAS-01-0004");
  });

  it("getMyTickets throws when the list cannot be loaded (so the page shows an error, not 'no tickets')", async () => {
    fakeDb({ data: null, error: { message: "boom" } });
    await expect(getMyTickets(UID)).rejects.toThrow();
  });

  it("getTicket returns the detail with its code, or null", async () => {
    const calls = fakeDb({ data: ticketRow(), error: null });
    expect((await getTicket(RID, UID))?.ticketCode).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(calls).toContainEqual(["eq", "user_id", UID]);
    fakeDb({ data: null, error: null });
    expect(await getTicket(RID, UID)).toBeNull();
  });
});
