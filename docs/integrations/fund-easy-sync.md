# st(AI)rway → Fund Easy sync — contract v1

Status: st(AI)rway side implemented (Phase 4, flagged off). Fund Easy side: **PROPOSED, NOT APPLIED** — see
`docs/integrations/fund-easy-patch/`.

## Purpose

Registrations (free and paid) and payments happen on st(AI)rway. Each confirmed, cancelled or refunded registration is
pushed one way to Fund Easy so it shows as a Fund Easy event ticket (Manage events → Attendees) and Fund Easy's door
scanner accepts the same QR. Fund Easy never calls st(AI)rway (reverse sync is out of scope).

## Transport

- `POST https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync` (Supabase Edge Function, `verify_jwt = false`).
- Body: one JSON envelope (≤ 16 KiB), `content-type: application/json`.
- Sender: the st(AI)rway Worker's 5-minute cron (`lib/sync/processor.ts`), at most 10 messages per run, 5 s timeout each.

## Headers

| Header | Value |
|---|---|
| `x-stairway-timestamp` | Unix time in seconds when the request was signed |
| `x-stairway-signature` | `v1=` + lower-case hex HMAC-SHA256 of `` `${timestamp}.${rawBody}` `` with the shared secret `STAIRWAY_SYNC_SECRET` (≥ 32 random characters, set on both sides, never in git) |
| `idempotency-key` | equal to the envelope's `idempotency_key` |

The receiver MUST: read the raw body before parsing; reject a timestamp more than 300 s from its clock; compute the
HMAC over exactly `timestamp + "." + rawBody`; compare in constant time; reject when `idempotency-key` differs from
the envelope's key.

## Envelope

```json
{
  "contract_version": 1,
  "id": "6f3c…-outbox-row-uuid",
  "idempotency_key": "<registration uuid>:registration.confirmed:<µs timestamp>",
  "type": "registration.confirmed",
  "occurred_at": "2026-10-10T10:00:00+00:00",
  "source": "stairway",
  "data": { "registration": { … }, "event": { … }, "attendee": { … } }
}
```

`type` is one of `registration.confirmed`, `registration.cancelled`, `payment.refunded`. `id` and `idempotency_key` are
identical on every retry of the same message. A new transition (e.g. confirmed again after a cancel) has a new key.

### `data.registration`

| Field | Type | When |
|---|---|---|
| `id` | uuid — st(AI)rway registration id; Fund Easy's `ticket_orders.external_id` | always |
| `status` | `confirmed` \| `cancelled` \| `refund_needed` \| `refunded` | always |
| `ticket_code` | 26-char base32 (`^[A-Z2-7]{26}$`); the QR content. Fund Easy stores it as `tickets.code` | confirmed |
| `token` | door token like `RAS-05-0042` (informational) | confirmed, token events |
| `amount_paise` | integer ≥ 0 (0 = free) | always |
| `currency` | `"INR"` | always |
| `receipt_number` | `STW-YYYY-NNNNNN` | paid |
| `razorpay_order_id`, `razorpay_payment_id` | Razorpay ids (shared Razorpay account) | paid |
| `razorpay_refund_id` | `rfnd_…` | refunded |
| `confirmed_at`, `paid_at`, `cancelled_at`, `refunded_at` | ISO timestamps | when set |
| `cancel_reason` | `user` \| `hold_expired` \| `late_payment_no_seat` \| `refunded` \| `account_deleted` | cancelled |

### `data.event`

`id` (st(AI)rway event uuid; Fund Easy's `events.external_ref`), `slug`, `title` (≤ 200), `starts_at`, `ends_at`,
`venue` (≤ 200), `capacity`, `price_paise`.

### `data.attendee` (only on `registration.confirmed`)

`email`, `full_name`. No phone, answers or IEEE id are ever sent. Fund Easy finds the user by email or creates a
passwordless account (the person can use "forgot password").

## Receiver semantics

| `type` | Effect on Fund Easy |
|---|---|
| `registration.confirmed` | Upsert event by `external_ref` (slug `stw-<slug>`, category `workshop`, status `published`), upsert one inactive tier `st(AI)rway` (never sold on Fund Easy; capacity follows st(AI)rway), upsert order by `external_id` as `paid` with the Razorpay ids, insert/refresh the ticket with `code = ticket_code` (no Fund Easy confirmation email), insert the receipt with st(AI)rway's `receipt_number` for paid orders. |
| `registration.cancelled` | Ticket `cancelled` (unless already checked in). Free orders → `expired`. Paid orders stay `paid` until `payment.refunded`. Unknown registration → ignored. |
| `payment.refunded` | Order `refunded`, ticket `cancelled`, a `processed` `ticket_refunds` row with the Razorpay refund id. Unknown registration → ignored. |

Synced orders cannot be refunded or their event cancelled from Fund Easy (both raise; refunds happen on st(AI)rway).

## Responses

| Status | Body | Sender behaviour |
|---|---|---|
| 200 | `{"ok":true,"result":"imported"\|"duplicate"\|"cancelled"\|"refunded"\|"ignored", "replayed"?: true, "order_id"?: uuid, "reason"?: "unknown_registration"}` (extra fields are informational; the sender ignores 2xx bodies) | sent |
| 400 | `{"ok":false,"error":"malformed"}` | dead-letter (permanent) |
| 401 / 403 | `{"ok":false,"error":"bad_signature"}` | retried (secret or clock problem) |
| 405 | `{"ok":false,"error":"method_not_allowed"}` | dead-letter (any 4xx other than 401, 403, 408, 425, 429 is permanent) |
| 408 / 425 / 429 | any | retried |
| 413 | `{"ok":false,"error":"too_large"}` | dead-letter |
| 422 | `{"ok":false,"error":"conflict_existing_order"\|"unsupported_version"\|"unsupported_type"}` | dead-letter |
| 5xx / timeout / network | `{"ok":false,"error":"retry"}` or none | retried |

The receiver records every processed `idempotency_key` with its result and returns that stored result (200,
`"replayed": true`) for a replay, without re-applying it. Error bodies carry a short machine code only, never personal
data; the sender stores at most `HTTP <status> <code>`.

## Retries, ordering, dead letters

- A claimed message holds a 2-minute lease; `attempts` is incremented on each claim.
- Backoff after a failed attempt n: 2^(n-1) minutes (1, 2, 4, …), capped at 6 hours; dead after 10 attempts or one
  permanent error. A `dead` message does not block later messages of the same registration.
- Ordering: the sender never sends a message while an earlier message of the same registration is still pending, so
  Fund Easy sees confirm → cancel → refund in order. The receiver still ignores a cancel/refund for an unknown
  registration (200 `ignored`).
- Requeue a dead message after fixing the cause (SQL editor on st(AI)rway's project):
  `update private.external_sync_outbox set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null where id = '<id>';`
- Payloads of sent messages are emptied after 30 days.

## Versioning

Additive fields may appear in v1 at any time; receivers ignore unknown fields. A breaking change bumps
`contract_version`; receivers answer 422 `unsupported_version` for a version they do not know.

## Manual test (after both sides are deployed with TEST data)

```bash
BODY='{"contract_version":1,"id":"00000000-0000-4000-8000-000000000001","idempotency_key":"manual-test-1","type":"registration.cancelled","occurred_at":"2026-10-10T10:00:00Z","source":"stairway","data":{"registration":{"id":"00000000-0000-4000-8000-0000000000aa","status":"cancelled"},"event":{"id":"00000000-0000-4000-8000-0000000000bb"}}}'
TS=$(date +%s)
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$STAIRWAY_SYNC_SECRET" -hex | sed 's/^.* //')
curl -sS -X POST "https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync" \
  -H "content-type: application/json" -H "x-stairway-timestamp: $TS" -H "x-stairway-signature: v1=$SIG" \
  -H "idempotency-key: manual-test-1" --data "$BODY"
# → 200 {"ok":true,"result":"ignored"} (unknown registration)
```

## PII minimisation

- Only `registration.confirmed` carries personal data: `attendee.email` (≤ 320) and `attendee.full_name` (≤ 200).
  Cancel/refund messages carry registration and event ids only.
- Never sent: phone, IEEE id, form answers, college, any free text. `profile_private` is never read.
- The receiver must not log bodies or headers and must keep error bodies to a machine code.
- st(AI)rway empties the payload of `sent` rows after 30 days; `dead` rows are kept until requeued or deleted by an
  admin.
- Account deletion on st(AI)rway emits `registration.cancelled` with `cancel_reason = "account_deleted"` (the
  registration id only); Fund Easy keeps its own user record, which is Fund Easy's to manage.

## Operations runbook

| Situation | Check / action |
|---|---|
| Nothing arrives | st(AI)rway: `FUND_EASY_SYNC_ENABLED=true`, `FUND_EASY_SYNC_URL`, `STAIRWAY_SYNC_SECRET`, `CRON_SECRET` set; Worker cron `*/5 * * * *` present. Fund Easy: function deployed with `--no-verify-jwt`, same secret. |
| Many 401 | Secrets differ, or clocks differ by more than 300 s. Fix and wait; retries continue (up to 10 attempts, ~17 h of backoff). |
| Backlog | `select status, count(*), min(created_at) from private.external_sync_outbox group by 1;` (SQL editor, st(AI)rway project). Throughput is 10 messages / 5 min = 120 / hour. |
| Dead message | `select id, event_type, attempts, last_error from private.external_sync_outbox where status = 'dead';` fix the cause, then requeue (statement above). `last_error` is `HTTP <status> <code>`, `timeout` or `network`. |
| Rotate the secret | Set the new value on Fund Easy first only if it accepts both; otherwise set both sides within one cron tick (5 min) and accept transient 401s, which are retried. |
| Kill switch | `FUND_EASY_SYNC_ENABLED` off: messages keep queuing, nothing is sent. |
| Replay a message by hand | Resend the same body with a fresh timestamp and signature; the receiver answers `replayed: true` without re-applying. |
