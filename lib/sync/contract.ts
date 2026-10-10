import { hmacSha256Hex } from "@/lib/payments/crypto";

// st(AI)rway -> Fund Easy outbound sync, contract version 1 (docs/integrations/fund-easy-sync.md is the spec the
// receiving endpoint implements). Every request: POST JSON envelope, signed with HMAC-SHA256 over
// `${timestamp}.${rawBody}` using STAIRWAY_SYNC_SECRET; the receiver rejects timestamps more than 5 minutes off.

export const CONTRACT_VERSION = 1 as const;
export const SYNC_EVENT_TYPES = ["registration.confirmed", "registration.cancelled", "payment.refunded"] as const;
export type SyncEventType = (typeof SYNC_EVENT_TYPES)[number];

export const SIGNATURE_HEADER = "x-stairway-signature";
export const TIMESTAMP_HEADER = "x-stairway-timestamp";
export const IDEMPOTENCY_HEADER = "idempotency-key";
const REQUEST_TIMEOUT_MS = 5000;

export interface OutboxRow {
  id: string;
  event_type: SyncEventType;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
}

export interface SyncEnvelope {
  contract_version: typeof CONTRACT_VERSION;
  /** Outbox row id: the same on every retry of this message. */
  id: string;
  idempotency_key: string;
  type: SyncEventType;
  occurred_at: string;
  source: "stairway";
  data: Record<string, unknown>;
}

export function buildEnvelope(row: OutboxRow): SyncEnvelope {
  return {
    contract_version: CONTRACT_VERSION,
    id: row.id,
    idempotency_key: row.idempotency_key,
    type: row.event_type,
    occurred_at: row.created_at,
    source: "stairway",
    data: row.payload,
  };
}

export async function signBody(secret: string, timestampSeconds: number, body: string): Promise<string> {
  return `v1=${await hmacSha256Hex(secret, `${timestampSeconds}.${body}`)}`;
}

export async function buildSyncRequest(secret: string, envelope: SyncEnvelope, nowMs: number): Promise<RequestInit> {
  const body = JSON.stringify(envelope);
  const ts = Math.floor(nowMs / 1000);
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "stairway-sync/1",
      [TIMESTAMP_HEADER]: String(ts),
      [SIGNATURE_HEADER]: await signBody(secret, ts, body),
      [IDEMPOTENCY_HEADER]: envelope.idempotency_key,
    },
    body,
    // Never follow a redirect: a 307/308 would re-POST the signed body (email, ticket code) to a third-party host.
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

export type DeliveryOutcome = { ok: true } | { ok: false; permanent: boolean; error: string };

/** 401/403 are retried: they mean a secret or clock problem we can fix without losing the message. */
const TRANSIENT_4XX = new Set([401, 403, 408, 425, 429]);
const CODE = /^[a-z0-9_.-]{1,60}$/i;

export function classifyResponse(status: number, bodyText: string): DeliveryOutcome {
  if (status >= 200 && status < 300) return { ok: true };
  let code = "";
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown };
    if (typeof parsed?.error === "string" && CODE.test(parsed.error)) code = ` ${parsed.error}`;
  } catch {
    // Not JSON: keep only the status.
  }
  const error = `HTTP ${status}${code}`;
  const permanent = status >= 400 && status < 500 && !TRANSIENT_4XX.has(status);
  return { ok: false, permanent, error };
}
