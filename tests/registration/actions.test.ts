import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  RedirectType: { push: "push", replace: "replace" },
  redirect: vi.fn((to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getAuthState: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/payments/config", () => ({ paymentsConfig: vi.fn(() => ({ enabled: false })) }));

import { paymentsConfig } from "@/lib/payments/config";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cancelRegistration, registerForEvent } from "@/lib/registration/actions";

type Res = { data: unknown; error: unknown };
type Call = { table: string; op: "select" | "update"; calls: unknown[][] };

const UID = "11111111-1111-4111-8111-111111111111";
const EID = "22222222-2222-4222-8222-222222222222";
const RID = "33333333-3333-4333-8333-333333333333";

/** Minimal chainable stand-in for the supabase-js query builder; results keyed by "table" or "table:update". */
function fakeDb(results: Record<string, Res | (() => Res)>, rpc: Record<string, Res | (() => Res)> = {}) {
  const log: Call[] = [];
  const rpcCalls: [string, unknown][] = [];
  const pick = (r: Res | (() => Res) | undefined): Res => (typeof r === "function" ? r() : r ?? { data: null, error: null });
  const db = {
    from(table: string) {
      const entry: Call = { table, op: "select", calls: [] };
      log.push(entry);
      const result = () => pick(results[entry.op === "update" ? `${table}:update` : table]);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "update"]) {
        b[m] = (...args: unknown[]) => {
          if (m === "update") entry.op = "update";
          entry.calls.push([m, ...args]);
          return b;
        };
      }
      b.maybeSingle = () => Promise.resolve(result());
      b.then = (ok: (v: Res) => unknown, err: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, err);
      return b;
    },
    rpc(name: string, args: unknown) {
      rpcCalls.push([name, args]);
      return Promise.resolve(pick(rpc[name]));
    },
  };
  vi.mocked(createClient).mockResolvedValue(db as never);
  return { log, rpcCalls };
}

const signedIn = (onboarded = true) =>
  vi.mocked(getAuthState).mockResolvedValue({
    user: { id: UID, email: "a@b.c" },
    profile: { handle: "asha", fullName: "Asha", avatarUrl: null, onboarded },
  } as never);

const openEvent = (over: Record<string, unknown> = {}) => ({
  data: {
    id: EID,
    questions: [{ id: "tshirt", label: "T-shirt size", type: "single_choice", options: ["S", "M"], required: true }],
    price_paise: 0,
    starts_at: new Date(Date.now() + 864e5).toISOString(),
    registration_opens_at: null,
    registration_closes_at: null,
    ...over,
  },
  error: null,
});

const values = {
  registrant: {
    fullName: "Asha Rao", college: "MEC", branch: "Computer Science", year: "2nd year",
    phone: "+91 98765 43210", ieeeMemberId: "",
  },
  answers: { tshirt: "M" },
};

const savedOk = { "profiles:update": { data: [{ id: UID }], error: null }, "profile_private:update": { data: [{ user_id: UID }], error: null } };

beforeEach(() => vi.clearAllMocks());

describe("registerForEvent", () => {
  it("rejects malformed slugs before touching auth or the database", async () => {
    for (const slug of ["../x", "A", "", 42 as unknown as string]) {
      expect(await registerForEvent(slug, values)).toMatchObject({ ok: false, error: { code: "event_not_found", recovery: "events" } });
    }
    expect(getAuthState).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires a session and a finished profile", async () => {
    vi.mocked(getAuthState).mockResolvedValue({ user: null, profile: null });
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
    signedIn(false);
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "not_onboarded" } });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reads only published events and reports a missing one", async () => {
    signedIn();
    const { log } = fakeDb({ events: { data: null, error: null } });
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "event_not_found" } });
    expect(log[0].calls).toContainEqual(["eq", "status", "published"]);
  });

  it("stops paid, not-yet-open and closed events before writing anything", async () => {
    signedIn();
    const cases: [Record<string, unknown>, string][] = [
      [{ price_paise: 9900 }, "paid_event"],
      [{ registration_opens_at: new Date(Date.now() + 36e5).toISOString() }, "not_open_yet"],
      [{ registration_closes_at: new Date(Date.now() - 1000).toISOString() }, "registration_closed"],
      [{ starts_at: new Date(Date.now() - 1000).toISOString() }, "registration_closed"],
    ];
    for (const [over, code] of cases) {
      const { log, rpcCalls } = fakeDb({ events: openEvent(over), ...savedOk });
      expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code } });
      expect(log.filter((c) => c.op === "update")).toHaveLength(0);
      expect(rpcCalls).toHaveLength(0);
    }
  });

  it("treats unparseable stored questions as an internal error", async () => {
    signedIn();
    fakeDb({ events: openEvent({ questions: [{ id: "Bad Id", type: "nope" }] }) });
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "unknown", recovery: "retry" } });
  });

  it("returns field errors keyed by form element id", async () => {
    signedIn();
    const { rpcCalls } = fakeDb({ events: openEvent(), ...savedOk });
    const res = await registerForEvent("seeing-machines", {
      registrant: { ...values.registrant, phone: "123" },
      answers: { tshirt: "XL" },
    });
    expect(res).toMatchObject({ ok: false, error: { code: "invalid_input", recovery: "fix_fields" } });
    if (res.ok) throw new Error("expected failure");
    expect(Object.keys(res.fieldErrors ?? {}).sort()).toEqual(["phone", "q-tshirt"]);
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects extra keys (no client-supplied ids or statuses)", async () => {
    signedIn();
    fakeDb({ events: openEvent(), ...savedOk });
    const res = await registerForEvent("seeing-machines", { ...values, userId: "someone-else" });
    expect(res).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("saves the profile back (only granted columns, scoped to the session user) and registers", async () => {
    signedIn();
    const { log, rpcCalls } = fakeDb(
      { events: openEvent(), ...savedOk },
      { register_for_event: { data: { registration_id: RID, status: "waitlisted", waitlist_position: 3 }, error: null } },
    );
    const res = await registerForEvent("seeing-machines", values);
    expect(res).toEqual({ ok: true, registrationId: RID, status: "waitlisted" });

    const pub = log.find((c) => c.table === "profiles" && c.op === "update")!;
    expect(pub.calls).toContainEqual(["update", { full_name: "Asha Rao", college: "MEC", branch: "Computer Science", year: "2nd year" }]);
    expect(pub.calls).toContainEqual(["eq", "id", UID]);
    const priv = log.find((c) => c.table === "profile_private" && c.op === "update")!;
    expect(priv.calls).toContainEqual(["update", { phone: "+91 98765 43210", ieee_member_id: "" }]);
    expect(priv.calls).toContainEqual(["eq", "user_id", UID]);

    expect(rpcCalls).toEqual([["register_for_event", { p_event_id: EID, p_answers: { tshirt: "M" } }]]);
    expect(revalidatePath).toHaveBeenCalledWith("/events/seeing-machines");
    expect(revalidatePath).toHaveBeenCalledWith("/me", "layout");
  });

  it("registers for a paid event when payments are on and returns the hold", async () => {
    vi.mocked(paymentsConfig).mockReturnValueOnce({ enabled: true } as never);
    signedIn();
    const { rpcCalls } = fakeDb(
      { events: openEvent({ price_paise: 19900 }), ...savedOk },
      { register_for_event: { data: { registration_id: RID, status: "pending_payment", waitlist_position: null,
          hold_expires_at: "2026-10-10T10:15:00Z", amount_paise: 19900, promoted: [] }, error: null } },
    );
    expect(await registerForEvent("seeing-machines", values)).toEqual({ ok: true, registrationId: RID, status: "pending_payment" });
    // The client never sends a price: the RPC takes only the event id and the answers.
    expect(rpcCalls).toEqual([["register_for_event", { p_event_id: EID, p_answers: { tshirt: "M" } }]]);
  });

  it("still refuses a paid event while payments are off", async () => {
    signedIn();
    const { rpcCalls } = fakeDb({ events: openEvent({ price_paise: 19900 }) });
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "paid_event" } });
    expect(rpcCalls).toEqual([]);
  });

  it("maps the database payments flag being off (paid_event) on a paid registration", async () => {
    vi.mocked(paymentsConfig).mockReturnValueOnce({ enabled: true } as never);
    signedIn();
    fakeDb(
      { events: openEvent({ price_paise: 19900 }), ...savedOk },
      { register_for_event: { data: null, error: { message: "paid_event", code: "P0001" } } },
    );
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "paid_event" } });
  });

  it("keeps a committed registration successful when revalidation throws", async () => {
    signedIn();
    fakeDb(
      { events: openEvent(), ...savedOk },
      { register_for_event: { data: { registration_id: RID, status: "confirmed", waitlist_position: null }, error: null } },
    );
    vi.mocked(revalidatePath).mockImplementation(() => {
      throw new Error("cache down");
    });
    try {
      expect(await registerForEvent("seeing-machines", values)).toEqual({ ok: true, registrationId: RID, status: "confirmed" });
    } finally {
      vi.mocked(revalidatePath).mockReset();
    }
  });

  it("treats a zero-row profile write as a failure and does not register", async () => {
    signedIn();
    for (const broken of [
      { "profiles:update": { data: [], error: null } },
      { "profile_private:update": { data: [], error: null } },
      { "profile_private:update": { data: null, error: { code: "23514", message: "violates check constraint" } } },
    ]) {
      const { rpcCalls } = fakeDb({ events: openEvent(), ...savedOk, ...broken });
      const res = await registerForEvent("seeing-machines", values);
      expect(res).toMatchObject({ ok: false, error: { code: "profile_save_failed", recovery: "retry" } });
      expect(JSON.stringify(res)).not.toContain("constraint");
      expect(rpcCalls).toHaveLength(0);
    }
  });

  it("passes busy errors through from the profile write", async () => {
    signedIn();
    fakeDb({ events: openEvent(), ...savedOk, "profiles:update": { data: null, error: { code: "57014", message: "canceling statement" } } });
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "busy" } });
  });

  it("never turns a privilege error on the profile write into a sign-in loop", async () => {
    signedIn();
    for (const table of ["profiles:update", "profile_private:update"]) {
      const { rpcCalls } = fakeDb({
        events: openEvent(), ...savedOk,
        [table]: { data: null, error: { code: "42501", message: "permission denied for table profiles" } },
      });
      const res = await registerForEvent("seeing-machines", values);
      expect(res).toMatchObject({ ok: false, error: { code: "profile_save_failed", recovery: "retry" } });
      expect(JSON.stringify(res)).not.toContain("permission");
      expect(rpcCalls).toHaveLength(0);
    }
  });

  it("reports an expired session (PostgREST JWT error) on the profile write as signed out", async () => {
    signedIn();
    for (const code of ["PGRST301", "PGRST302", "PGRST303"]) {
      fakeDb({ events: openEvent(), ...savedOk, "profiles:update": { data: null, error: { code, message: "JWT expired" } } });
      expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "not_signed_in", recovery: "sign_in" } });
    }
  });

  it("passes network errors through from the profile write", async () => {
    signedIn();
    fakeDb({ events: openEvent(), ...savedOk, "profile_private:update": { data: null, error: { code: "", message: "TypeError: fetch failed" } } });
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "network" } });
  });

  it("maps RPC errors without leaking their text", async () => {
    signedIn();
    const cases: [Res["error"], string, string][] = [
      [{ code: "P0001", message: "already_registered" }, "already_registered", "tickets"],
      [{ code: "P0001", message: "invalid_answers" }, "invalid_answers", "reload"],
      [{ code: "55P03", message: "canceling statement due to lock timeout" }, "busy", "retry"],
      [{ code: "XX000", message: "internal: relation private.secret" }, "unknown", "retry"],
    ];
    for (const [error, code, recovery] of cases) {
      fakeDb({ events: openEvent(), ...savedOk }, { register_for_event: { data: null, error } });
      const res = await registerForEvent("seeing-machines", values);
      expect(res).toMatchObject({ ok: false, error: { code, recovery } });
      expect(JSON.stringify(res)).not.toMatch(/relation|lock timeout/);
    }
  });

  it("turns thrown errors into typed results", async () => {
    signedIn();
    vi.mocked(createClient).mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "network" } });
    vi.mocked(createClient).mockRejectedValueOnce(new Error("secret internals"));
    const res = await registerForEvent("seeing-machines", values);
    expect(res).toMatchObject({ ok: false, error: { code: "unknown" } });
    expect(JSON.stringify(res)).not.toContain("secret");
  });

  it("fails safely on an unexpected RPC result shape", async () => {
    signedIn();
    fakeDb({ events: openEvent(), ...savedOk }, { register_for_event: { data: { registration_id: "x" }, error: null } });
    expect(await registerForEvent("seeing-machines", values)).toMatchObject({ ok: false, error: { code: "unknown" } });
  });
});

describe("cancelRegistration", () => {
  it("rejects malformed ids before touching auth", async () => {
    for (const id of ["nope", "", "1; drop table", 7 as unknown as string]) {
      expect(await cancelRegistration(id)).toMatchObject({ ok: false, error: { code: "registration_not_found" } });
    }
    expect(getAuthState).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    vi.mocked(getAuthState).mockResolvedValue({ user: null, profile: null });
    expect(await cancelRegistration(RID)).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("cancels through the RPC, revalidates, then redirects to the fixed My tickets path", async () => {
    signedIn();
    const { log, rpcCalls } = fakeDb(
      { registrations: { data: { event: { slug: "seeing-machines" } }, error: null } },
      { cancel_registration: { data: { registration_id: RID, event_id: EID, promoted: 1 }, error: null } },
    );
    // The redirect error must escape the action (not be swallowed into a typed error).
    await expect(cancelRegistration(RID)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/me/tickets?cancelled=1", "replace");
    expect(log[0].calls).toContainEqual(["eq", "user_id", UID]);
    expect(rpcCalls).toEqual([["cancel_registration", { p_registration_id: RID }]]);
    expect(revalidatePath).toHaveBeenCalledWith("/events/seeing-machines");
    expect(revalidatePath).toHaveBeenCalledWith("/me/tickets");
    // Never the ticket route itself (it 404s once cancelled), nor the whole /me layout.
    expect(revalidatePath).not.toHaveBeenCalledWith("/me", "layout");
    expect(vi.mocked(revalidatePath).mock.calls.every(([p]) => !String(p).startsWith("/me/tickets/"))).toBe(true);
    // Revalidation runs before the redirect.
    const lastRevalidate = Math.max(...vi.mocked(revalidatePath).mock.invocationCallOrder);
    expect(lastRevalidate).toBeLessThan(vi.mocked(redirect).mock.invocationCallOrder[0]);
  });

  it("still redirects when revalidation throws (the cancel committed)", async () => {
    signedIn();
    fakeDb(
      { registrations: { data: { event: { slug: "seeing-machines" } }, error: null } },
      { cancel_registration: { data: { registration_id: RID, event_id: EID, promoted: 0 }, error: null } },
    );
    vi.mocked(revalidatePath).mockImplementation(() => {
      throw new Error("cache down");
    });
    try {
      await expect(cancelRegistration(RID)).rejects.toThrow("NEXT_REDIRECT");
      expect(redirect).toHaveBeenCalledWith("/me/tickets?cancelled=1", "replace");
    } finally {
      vi.mocked(revalidatePath).mockReset();
    }
  });

  it("still redirects when the RPC result shape is unexpected (the cancel committed)", async () => {
    signedIn();
    fakeDb({ registrations: { data: null, error: null } }, { cancel_registration: { data: { nope: true }, error: null } });
    await expect(cancelRegistration(RID)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("returns a typed error and does not redirect when the call throws", async () => {
    signedIn();
    vi.mocked(createClient).mockRejectedValue(new Error("fetch failed"));
    expect(await cancelRegistration(RID)).toMatchObject({ ok: false, error: { code: "network" } });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("maps RPC errors (someone else's registration looks not-found)", async () => {
    signedIn();
    fakeDb({ registrations: { data: null, error: null } }, { cancel_registration: { data: null, error: { code: "P0001", message: "registration_not_found" } } });
    expect(await cancelRegistration(RID)).toMatchObject({ ok: false, error: { code: "registration_not_found", recovery: "tickets" } });
    fakeDb({ registrations: { data: null, error: null } }, { cancel_registration: { data: null, error: { code: "P0001", message: "event_started" } } });
    expect(await cancelRegistration(RID)).toMatchObject({ ok: false, error: { code: "event_started" } });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
