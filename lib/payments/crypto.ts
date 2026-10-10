// HMAC-SHA256 with WebCrypto (available in Workers, browsers and Node 20+). No Node `crypto`, no Buffer.

const enc = new TextEncoder();
const HEX64 = /^[0-9a-f]{64}$/;

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  let out = "";
  for (const b of sig) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Constant-time for equal lengths (signatures are always 64 hex characters, so the length leaks nothing). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Razorpay Checkout success: signature = HMAC-SHA256(`${order_id}|${payment_id}`, key secret), lower-case hex. */
export async function verifyCheckoutSignature(secret: string, orderId: string, paymentId: string, signature: string): Promise<boolean> {
  if (!secret || typeof signature !== "string" || !HEX64.test(signature)) return false;
  return timingSafeEqualHex(await hmacSha256Hex(secret, `${orderId}|${paymentId}`), signature);
}

/** Razorpay webhook: `x-razorpay-signature` = HMAC-SHA256(raw request body, webhook secret). Never re-serialise the body. */
export async function verifyWebhookSignature(secret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!secret || !signature || !HEX64.test(signature)) return false;
  return timingSafeEqualHex(await hmacSha256Hex(secret, rawBody), signature);
}
