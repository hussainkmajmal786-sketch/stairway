// PROPOSED — NOT APPLIED. HMAC check for the st(AI)rway sync (contract v1).

const enc = new TextEncoder();
export const TOLERANCE_SECONDS = 300;

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `x-stairway-signature: v1=<hex HMAC-SHA256(`${timestamp}.${rawBody}`)>`, timestamp within ±300 s. */
export async function verifySignature(
  secret: string,
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  nowMs: number,
): Promise<boolean> {
  if (!timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^v1=[0-9a-f]{64}$/.test(signature)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  return safeEqual(`v1=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`, signature);
}
