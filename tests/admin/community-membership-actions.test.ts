import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ authorize: vi.fn() }));

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/admin/auth";
import { decideClaim, getProofUrl, importRosterChunk, revokeClaim } from "@/lib/community/membership-admin-actions";
import {
  EXPIRING_DAYS, VALIDATOR_URL, defaultApprovalDate, filterExpiring, isExpiringSoon, prescreenChips, validateApproval,
} from "@/lib/community/membership-admin";
import { fakeDb, rpcCalls, type Res } from "./fake-db";

const CLAIM = "33333333-3333-4333-8333-333333333333";

function asSuper(script: Record<string, Res | Res[]> = {}, signed: unknown = { data: { signedUrl: "https://signed.test/x?t=1" }, error: null }) {
  const { db, calls } = fakeDb(script);
  const createSignedUrl = vi.fn(async () => signed);
  const from = vi.fn(() => ({ createSignedUrl }));
  const full = { ...db, storage: { from } };
  vi.mocked(authorize).mockResolvedValue({ ok: true, ctx: { userId: "me", isSuper: true, societyIds: [] }, db: full as never, societyId: null });
  return { calls, createSignedUrl, from };
}
function denied() {
  const { db, calls } = fakeDb();
  const from = vi.fn();
  vi.mocked(authorize).mockResolvedValue({ ok: false, error: { code: "forbidden", message: "x" } });
  return { calls, from, db };
}

beforeEach(() => vi.clearAllMocks());

const CALLS: [string, () => Promise<unknown>][] = [
  ["importRosterChunk", () => importRosterChunk({ rows: [{ n: "12345678", e: "2027-01-01" }], replace: true })],
  ["decideClaim", () => decideClaim({ claimId: CLAIM, approve: false, reason: "other" })],
  ["revokeClaim", () => revokeClaim(CLAIM)],
  ["getProofUrl", () => getProofUrl(CLAIM)],
];

describe("authorisation", () => {
  it.each(CALLS)("%s: non-super (society admin, plain user, signed out) is forbidden with zero calls", async (_n, run) => {
    const d = denied();
    expect(await run()).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(authorize).toHaveBeenCalledWith({ kind: "super" });
    expect(d.calls).toHaveLength(0);
    expect(d.from).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("importRosterChunk", () => {
  it("rejects invalid payloads with zero RPC calls", async () => {
    const { calls } = asSuper();
    const tooMany = Array.from({ length: 1001 }, () => ({ n: "12345678", e: "2027-01-01" }));
    for (const bad of [null, {}, { rows: tooMany, replace: true }, { rows: [], replace: "yes" }, { rows: [{ n: 12345678, e: "x" }], replace: true }, { rows: [], replace: true, extra: 1 }]) {
      expect(await importRosterChunk(bad)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("forwards only {n,e,name} and maps the counts", async () => {
    const { calls } = asSuper({ "rpc.import_ieee_roster": { data: { rows: 2, extended: 1, auto_verified: 3 }, error: null } });
    const r = await importRosterChunk({
      rows: [{ n: "12345678", e: "2027-01-01", name: "Asha Rao", evil: "x" }, { n: "87654321", e: "2027-02-02" }],
      replace: true,
    });
    expect(r).toEqual({ ok: true, data: { rows: 2, extended: 1, autoVerified: 3 } });
    expect(rpcCalls(calls, "import_ieee_roster")[0].args[1]).toEqual({
      p_rows: [{ n: "12345678", e: "2027-01-01", name: "Asha Rao" }, { n: "87654321", e: "2027-02-02" }],
      p_replace: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/membership");
  });
  it("does not revalidate on failure and never echoes SQL text", async () => {
    asSuper({ "rpc.import_ieee_roster": { data: null, error: { message: "relation private.ieee_roster blows up", code: "XX000" } } });
    const r = await importRosterChunk({ rows: [], replace: false });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/ieee_roster/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("decideClaim", () => {
  it("rejects bad payloads with zero RPC calls", async () => {
    const { calls } = asSuper();
    for (const bad of [
      { claimId: "nope", approve: false, reason: "other" },
      { claimId: CLAIM, approve: true },
      { claimId: CLAIM, approve: true, verifiedUntil: "2027-12-31" },
      { claimId: CLAIM, approve: true, verifiedUntil: "2027-12-31", validatorConfirmed: false },
      { claimId: CLAIM, approve: true, verifiedUntil: "31/12/2027", validatorConfirmed: true },
      { claimId: CLAIM, approve: false },
      { claimId: CLAIM, approve: false, reason: "because" },
      { claimId: CLAIM, approve: false, reason: "other", verifiedUntil: "2027-01-01" },
    ]) {
      expect(await decideClaim(bad)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(rpcCalls(calls)).toHaveLength(0);
  });
  it("approves and rejects through the RPC and revalidates", async () => {
    const { calls } = asSuper({ "rpc.admin_decide_claim": { data: null, error: null }, "rpc.admin_approve_claim": { data: null, error: null } });
    expect(await decideClaim({ claimId: CLAIM, approve: true, verifiedUntil: "2027-12-31", validatorConfirmed: true })).toEqual({ ok: true, data: undefined });
    expect(rpcCalls(calls, "admin_approve_claim")[0].args[1]).toEqual({ p_claim_id: CLAIM, p_verified_until: "2027-12-31", p_validator_confirmed: true });
    expect(rpcCalls(calls, "admin_decide_claim")).toHaveLength(0);
    expect(await decideClaim({ claimId: CLAIM, approve: false, reason: "unreadable" })).toMatchObject({ ok: true });
    expect(rpcCalls(calls, "admin_decide_claim")[0].args[1]).toMatchObject({ p_approve: false, p_reason: "unreadable" });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });
  it("23505 is a conflict with the plan copy; invalid_date and not_found are mapped", async () => {
    asSuper({ "rpc.admin_approve_claim": { data: null, error: { message: "dup", code: "23505" } } });
    expect(await decideClaim({ claimId: CLAIM, approve: true, verifiedUntil: "2027-12-31", validatorConfirmed: true })).toMatchObject({
      ok: false, error: { code: "conflict", message: "That number is already verified on another account." },
    });
    asSuper({ "rpc.admin_approve_claim": { data: null, error: { message: "invalid_date", code: "P0001" } } });
    expect(await decideClaim({ claimId: CLAIM, approve: true, verifiedUntil: "2099-12-31", validatorConfirmed: true })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    asSuper({ "rpc.admin_decide_claim": { data: null, error: { message: "not_found", code: "P0001" } } });
    expect(await decideClaim({ claimId: CLAIM, approve: false, reason: "other" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revokeClaim", () => {
  it("validates the id, calls the RPC, revalidates only on success", async () => {
    const { calls } = asSuper({ "rpc.admin_revoke_claim": { data: null, error: null } });
    expect(await revokeClaim("nope")).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(rpcCalls(calls)).toHaveLength(0);
    expect(await revokeClaim(CLAIM)).toMatchObject({ ok: true });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });
});

describe("getProofUrl", () => {
  const okScript = {
    "rpc.admin_claim_proof": { data: "uid/abcdefgh.png", error: null },
    "rpc.log_admin_event": { data: null, error: null },
  };
  it("takes the path from the database, audits BEFORE signing, signs for 300 s", async () => {
    const order: string[] = [];
    const { calls, createSignedUrl } = asSuper(okScript);
    createSignedUrl.mockImplementation(async () => {
      order.push(`sign:${calls.filter((c) => c.args[0] === "log_admin_event").length}`);
      return { data: { signedUrl: "https://signed.test/x" }, error: null };
    });
    const r = await getProofUrl(CLAIM);
    expect(r).toEqual({ ok: true, data: { url: "https://signed.test/x" } });
    expect(order).toEqual(["sign:1"]); // exactly one audit row existed when the URL was minted
    expect(createSignedUrl).toHaveBeenCalledWith("uid/abcdefgh.png", 300);
    expect(rpcCalls(calls, "admin_claim_proof")[0].args[1]).toEqual({ p_claim_id: CLAIM });
    expect(rpcCalls(calls, "log_admin_event")[0].args[1]).toMatchObject({
      p_action: "membership.proof_view", p_target_type: "ieee_claim", p_target_id: CLAIM, p_summary: {},
    });
  });
  it("unknown claim: not_found, no audit row, no URL", async () => {
    const { calls, from } = asSuper({ "rpc.admin_claim_proof": { data: null, error: { message: "not_found", code: "P0001" } } });
    expect(await getProofUrl(CLAIM)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(rpcCalls(calls, "log_admin_event")).toHaveLength(0);
    expect(from).not.toHaveBeenCalled();
  });
  it("failed audit write means no URL is minted", async () => {
    const { from } = asSuper({ ...okScript, "rpc.log_admin_event": { data: null, error: { message: "x", code: "XX000" } } });
    expect(await getProofUrl(CLAIM)).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(from).not.toHaveBeenCalled();
  });
  it("a signing failure returns unavailable without leaking details", async () => {
    asSuper(okScript, { data: null, error: { message: "bucket secret" } });
    const r = await getProofUrl(CLAIM);
    expect(r).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(r)).not.toMatch(/bucket secret/);
  });
});

describe("read-model helpers", () => {
  it("defaultApprovalDate uses a valid pre-screen expiry else 31 Dec of this year", () => {
    const now = Date.UTC(2026, 9, 18);
    expect(defaultApprovalDate("2027-03-04", now)).toBe("2027-03-04");
    expect(defaultApprovalDate("2026-01-01", now)).toBe("2026-12-31");
    expect(defaultApprovalDate("2099-01-01", now)).toBe("2026-12-31");
    expect(defaultApprovalDate(null, now)).toBe("2026-12-31");
  });
  it("prescreenChips are always hints with words", () => {
    expect(prescreenChips({})).toEqual([{ text: "Auto-check not run", tone: "neutral" }]);
    expect(prescreenChips({ status: "done", readable: false })[0].text).toBe("Unreadable");
    const c = prescreenChips({ status: "done", readable: true, number_match: true, name_match: false, expiry: "2027-12-31" });
    expect(c.map((x) => x.text)).toEqual(["Number matches", "Name does not match", "Expiry read: 31 Dec 2027"]);
  });
});

describe("validateApproval", () => {
  const now = Date.UTC(2026, 9, 18, 6, 0); // 18 Oct 2026 IST
  it("requires the Validator checkbox first", () => {
    expect(validateApproval({ confirmed: false, verifiedUntil: "2027-01-01" }, now)).toBe("not_confirmed");
  });
  it("accepts today and the 740 day boundary, rejects past, too far, empty and impossible dates", () => {
    expect(validateApproval({ confirmed: true, verifiedUntil: "2026-10-18" }, now)).toBeNull();
    expect(validateApproval({ confirmed: true, verifiedUntil: "2028-10-27" }, now)).toBeNull();
    expect(validateApproval({ confirmed: true, verifiedUntil: "2026-10-17" }, now)).toBe("date_past");
    expect(validateApproval({ confirmed: true, verifiedUntil: "2028-10-28" }, now)).toBe("date_too_far");
    expect(validateApproval({ confirmed: true, verifiedUntil: "" }, now)).toBe("date_missing");
    expect(validateApproval({ confirmed: true, verifiedUntil: "31/12/2026" }, now)).toBe("date_invalid");
    expect(validateApproval({ confirmed: true, verifiedUntil: "2027-02-30" }, now)).toBe("date_invalid");
  });
});

describe("expiry window and filter", () => {
  const today = "2026-10-18";
  it("treats the next 30 days (inclusive) as expiring and lapsed dates as not", () => {
    expect(EXPIRING_DAYS).toBe(30);
    expect(isExpiringSoon("2026-10-18", today)).toBe(true);
    expect(isExpiringSoon("2026-11-17", today)).toBe(true);
    expect(isExpiringSoon("2026-11-18", today)).toBe(false);
    expect(isExpiringSoon("2026-10-17", today)).toBe(false);
  });
  it("filters rows without mutating the input", () => {
    const rows = [{ verified_until: "2026-10-20" }, { verified_until: "2027-05-01" }, { verified_until: "2026-10-01" }];
    expect(filterExpiring(rows, today)).toEqual([{ verified_until: "2026-10-20" }]);
    expect(rows).toHaveLength(3);
  });
});

describe("validator link", () => {
  it("is the official vTools page with no query or fragment", () => {
    const u = new URL(VALIDATOR_URL);
    expect(u.origin).toBe("https://vtools.ieee.org");
    expect(u.search).toBe("");
    expect(u.hash).toBe("");
  });
});

describe("import boundary", () => {
  it("the roster and queue modules are imported only by /admin/membership code", () => {
    const ROOT = resolve(__dirname, "../..");
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(n)) out.push(p);
      }
      return out;
    };
    const files = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));
    const importers = files
      .filter((f) => /components\/admin\/community\/(?:RosterUploader|ReviewQueue|VerifiedList)|membership-admin-actions/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f).replace(/\\/g, "/"))
      .filter((p) => !p.startsWith("components/admin/community/") && p !== "lib/community/membership-admin-actions.ts");
    expect(importers).toEqual(["app/admin/membership/page.tsx"]);
  });
});
