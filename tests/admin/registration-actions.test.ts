import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/admin/auth";
import {
  cancelRegistrationAction, checkInAction, promoteWaitlistAction, searchRegistrantsAction, undoCheckInAction,
} from "@/lib/admin/registration-actions";
import { fakeDb, rpcCalls } from "./fake-db";

const RAS_EVENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CS_EVENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FORBIDDEN = { code: "forbidden", message: "You do not have access to do that." };

/** A society admin who manages only RAS_EVENT. */
function asRasAdmin(db: unknown) {
  vi.mocked(authorize).mockImplementation((async (scope: { kind: string; eventId?: string }) => {
    if (scope.kind === "any" || (scope.kind === "event" && scope.eventId === RAS_EVENT)) {
      return { ok: true, ctx: { userId: "u", isSuper: false, societyIds: ["s"] }, db, societyId: "s" };
    }
    return { ok: false, error: FORBIDDEN };
  }) as never);
}

beforeEach(() => vi.clearAllMocks());

describe("cancelRegistrationAction", () => {
  it("refuses a registration of a foreign society before any rpc", async () => {
    const { db, calls } = fakeDb({ "registrations.select": { data: { event_id: CS_EVENT }, error: null } });
    asRasAdmin(db);
    const r = await cancelRegistrationAction({ registrationId: REG });
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("treats an unknown registration the same way", async () => {
    const { db, calls } = fakeDb({ "registrations.select": { data: null, error: null } });
    asRasAdmin(db);
    expect(await cancelRegistrationAction({ registrationId: REG })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("cancels an own registration and revalidates", async () => {
    const { db, calls } = fakeDb({
      "registrations.select": { data: { event_id: RAS_EVENT }, error: null },
      "events.select": { data: { slug: "intro" }, error: null },
      "rpc.admin_cancel_registration": { data: { status: "refund_needed", promoted: 1 }, error: null },
    });
    asRasAdmin(db);
    const r = await cancelRegistrationAction({ registrationId: REG });
    expect(r).toEqual({ ok: true, data: { status: "refund_needed", promoted: 1 } });
    expect(rpcCalls(calls, "admin_cancel_registration")[0].args[1]).toEqual({ p_registration_id: REG });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/events/${RAS_EVENT}/registrations`);
    expect(revalidatePath).toHaveBeenCalledWith("/events/intro");
  });
  it.each(["not_cancellable", "already_checked_in"])("maps %s to locked", async (code) => {
    const { db } = fakeDb({
      "registrations.select": { data: { event_id: RAS_EVENT }, error: null },
      "rpc.admin_cancel_registration": { data: null, error: { message: code, code: "P0001" } },
    });
    asRasAdmin(db);
    expect(await cancelRegistrationAction({ registrationId: REG })).toMatchObject({ ok: false, error: { code: "locked" } });
  });
  it("rejects a malformed id before any I/O", async () => {
    expect(await cancelRegistrationAction({ registrationId: "nope" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(authorize).not.toHaveBeenCalled();
  });
});

describe("undoCheckInAction / promoteWaitlistAction", () => {
  it("undo is scoped through the registration's event", async () => {
    const { db, calls } = fakeDb({ "registrations.select": { data: { event_id: CS_EVENT }, error: null } });
    asRasAdmin(db);
    expect(await undoCheckInAction({ registrationId: REG })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("promote authorises the event and reports the count", async () => {
    const { db } = fakeDb({ "rpc.admin_promote_waitlist": { data: { promoted: 3 }, error: null }, "events.select": { data: { slug: "x" }, error: null } });
    asRasAdmin(db);
    expect(await promoteWaitlistAction({ eventId: RAS_EVENT })).toEqual({ ok: true, data: { promoted: 3 } });
    expect(await promoteWaitlistAction({ eventId: CS_EVENT })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("checkInAction", () => {
  it("passes only the rpc parameters and never revalidates", async () => {
    const { db, calls } = fakeDb({
      "rpc.admin_check_in": {
        data: {
          result: "confirm_identity",
          attendee: { registration_id: REG, full_name: "A", handle: "a", avatar_url: null, college: "C", token_number: 7, token_prefix: "RAS" },
        },
        error: null,
      },
    });
    asRasAdmin(db);
    const r = await checkInAction({ eventId: RAS_EVENT, code: "RAS-0007", confirm: false });
    expect(r).toMatchObject({ ok: true, data: { result: "confirm_identity", attendee: { full_name: "A", token_number: 7 } } });
    expect(rpcCalls(calls, "admin_check_in")[0].args[1]).toEqual({ p_event_id: RAS_EVENT, p_code: "RAS-0007", p_confirm: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("rejects over-long codes, empty and unknown-key requests before any rpc", async () => {
    const { db, calls } = fakeDb();
    asRasAdmin(db);
    expect(await checkInAction({ eventId: RAS_EVENT, code: "A".repeat(41) })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await checkInAction({ eventId: RAS_EVENT })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await checkInAction({ eventId: RAS_EVENT, code: "x", extra: 1 })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("forbids a foreign event", async () => {
    const { db, calls } = fakeDb();
    asRasAdmin(db);
    expect(await checkInAction({ eventId: CS_EVENT, code: "RAS-0007" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("an rpc error is an error, never a check-in", async () => {
    const { db } = fakeDb({ "rpc.admin_check_in": { data: null, error: { message: "fetch failed" } } });
    asRasAdmin(db);
    expect((await checkInAction({ eventId: RAS_EVENT, registrationId: REG })).ok).toBe(false);
  });
  it("an unexpected result shape is an error", async () => {
    const { db } = fakeDb({ "rpc.admin_check_in": { data: { result: "weird" }, error: null } });
    asRasAdmin(db);
    expect((await checkInAction({ eventId: RAS_EVENT, code: "1" })).ok).toBe(false);
  });
});

describe("searchRegistrantsAction", () => {
  it("returns the minimal shape and never contact fields", async () => {
    const { db, calls } = fakeDb({
      "events.select": { data: { token_prefix: "RAS-05" }, error: null },
      "rpc.admin_event_registrants": {
        data: {
          total: 1,
          rows: [{
            registration_id: REG, status: "confirmed", created_at: "2030-01-01", full_name: "Asha", college: "CIT",
            token_number: 42, checked_in_at: null, email: "a@x.in", phone: "+919800000000", answers: { q: "secret" },
            razorpay_payment_id: "pay_1",
          }],
        },
        error: null,
      },
    });
    asRasAdmin(db);
    const r = await searchRegistrantsAction({ eventId: RAS_EVENT, q: "asha" });
    expect(r).toEqual({
      ok: true,
      data: [{ id: REG, fullName: "Asha", college: "CIT", token: "RAS-05-0042", status: "confirmed", checkedIn: false }],
    });
    expect(JSON.stringify(r)).not.toMatch(/email|phone|a@x\.in|pay_1|secret/);
    expect(rpcCalls(calls)[0].args[1]).toMatchObject({ p_status: "confirmed", p_limit: 10 });
  });
  it("rejects an empty query and a foreign event", async () => {
    const { db, calls } = fakeDb();
    asRasAdmin(db);
    expect(await searchRegistrantsAction({ eventId: RAS_EVENT, q: "  " })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await searchRegistrantsAction({ eventId: CS_EVENT, q: "a" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(rpcCalls(calls)).toHaveLength(0);
  });
});
