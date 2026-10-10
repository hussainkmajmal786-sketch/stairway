// PROPOSED — NOT APPLIED. Run with: deno test supabase/functions/external-sync/
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { hmacHex, verifySignature } from "./verify.ts";

const SECRET = "s".repeat(32);
const BODY = '{"contract_version":1}';
// Same vector as st(AI)rway's lib/sync/contract.ts produces (computed with Node's crypto.createHmac).
const EXPECTED = "dfa18eb321e11ad2aec3a678f8f5ff130114131261505f0178a529a50b755af5";

Deno.test("matches the st(AI)rway signer", async () => {
  assertEquals(await hmacHex(SECRET, `1760000000.${BODY}`), EXPECTED);
});

Deno.test("accepts a fresh, correct signature", async () => {
  assert(await verifySignature(SECRET, BODY, "1760000000", `v1=${EXPECTED}`, 1760000100_000));
});

Deno.test("rejects stale timestamps, tampered bodies and malformed headers", async () => {
  assertFalse(await verifySignature(SECRET, BODY, "1760000000", `v1=${EXPECTED}`, 1760000301_000));
  assertFalse(await verifySignature(SECRET, BODY + " ", "1760000000", `v1=${EXPECTED}`, 1760000000_000));
  assertFalse(await verifySignature(SECRET, BODY, "1760000000", EXPECTED, 1760000000_000));
  assertFalse(await verifySignature(SECRET, BODY, null, `v1=${EXPECTED}`, 1760000000_000));
});
