# Payments go-live checklist (user steps)

Nothing here is done by the assistant. Never paste a secret in chat, a commit or an issue. Payments stay OFF until steps 2 and 5 are both done. Full background: README section 3d.

## 1. Upgrade Cloudflare to Workers Paid

Workers & Pages -> Plans -> Workers Paid ($5/month). Pre-condition for everything below: Free gives 10 ms CPU per request (error 1102 already happens) (the Worker bundle itself now fits the Free 3072 KiB cap thanks to `minify`, about 2774 KiB gzip). Afterwards the assistant can add `"limits": { "cpu_ms": 5000 }` to `wrangler.jsonc` as a runaway guard.

## 2. Add the secrets in Cloudflare

Workers & Pages -> stairway -> Settings -> Variables and Secrets, type **Secret** (or `npx wrangler secret put NAME`). Plain-text variables are dropped on the next deploy.

- `PAYMENTS_ENABLED` (value `true`)
- `RAZORPAY_KEY_ID` (TEST key first)
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET` (the value you will type in step 4)
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (32+ random characters; **required**: payments stay off without it, because the cron tick releases expired holds)
- Optional, only after step 9: `FUND_EASY_SYNC_URL`, `STAIRWAY_SYNC_SECRET`, `FUND_EASY_SYNC_ENABLED`

## 3. Razorpay: Payment capture = Automatic

Razorpay Dashboard -> Account & Settings -> Payment capture -> **Automatic (immediate)**. The account is shared with Fund Easy: check it in test mode AND later in live mode, and confirm with Fund Easy's owner before changing it. Without automatic capture no st(AI)rway payment ever confirms (payments stay *authorized* and Razorpay auto-refunds them).

## 4. Razorpay webhook (TEST mode)

In Test mode: Account & Settings -> Webhooks -> Add new. URL `https://stairway.ieeesbcek.workers.dev/api/payments/webhook`, events `order.paid` and `refund.processed`, secret = the `RAZORPAY_WEBHOOK_SECRET` value. Leave Fund Easy's webhook as it is.

## 5. Set the database flag

Supabase SQL editor (project `nfrdsdnrtsbttyrmfppy`):

```sql
update private.feature_flags set enabled = true, updated_at = now() where key = 'payments';
```

## 6. Create a Rs 1 test event

Until the Phase 5 admin UI exists, use SQL (pick an upcoming, published session you can spare, or ask the assistant to prepare a dedicated draft test-event migration):

```sql
update public.events set price_paise = 100 where slug = '<an-upcoming-test-session>';
```

Set it back afterwards (`price_paise = 0` for a free session, or its real price).

## 7. Run the test-card flow (phone and desktop)

Register -> "Continue to payment" -> Razorpay test checkout (card `4111 1111 1111 1111`, any future expiry, any CVV, choose *Success*; or UPI `success@razorpay`). Eyeball every state:

- Hold countdown (m:ss) on the event page, the ticket and My tickets, and "Complete payment" resumes Checkout.
- Success: ticket shows **Confirmed**, QR (or token) and the `STW-YYYY-NNNNNN` receipt; no QR/token before that.
- Razorpay Dashboard -> Webhooks shows a 200 delivery; Payments shows the payment **Captured** (not Authorized) within seconds. If it stays Authorized, stop and fix step 3.
- Close Checkout once, then complete payment from My tickets.
- Failed payment (test card failure option): "Payment failed" message, hold kept, retry works.
- Let one hold expire (wait more than 15 minutes, then refresh): "Seat hold expired".
- Cancel a paid seat: **Refund pending** label.
- After a refund is processed, **Refunded** label. Only refunds started from st(AI)rway itself (the refund helper in `lib/payments/refunds.ts`, and the Phase 5 admin button when it ships) are tracked: they carry the registration in the refund's notes. A refund made by hand in the Razorpay dashboard is **not** reflected on the ticket automatically (the webhook logs `refund_not_tracked` and ignores it). Workaround: mark it from the Phase 5 admin tool; until that exists, call the SQL function `mark_refunded` as the service role (SQL editor), then check the ticket.
- Sold-out paid session: waitlist, then promotion after a hold expires.

## 8. Only then: live keys

KYC complete, live API keys and a live-mode webhook (same URL, same two events), re-check capture = Automatic in live mode, repeat step 7 with a real Rs 1 payment and refund it. Decide what to do with the test registrations and payments: they are real rows on the live database, and rows with a payment order cannot be deleted by cascade.

## 9. Fund Easy sync (later, separate)

Pre-conditions before the patch in `docs/integrations/fund-easy-patch/` may be applied (all done by you or Fund Easy's owner, not by this repo):

- Rotate or remove the seeded super-admin accounts on Fund Easy.
- Create the private GitHub backup of Fund Easy.
- Review the patch and its README, apply it to Fund Easy yourself, and set the same `STAIRWAY_SYNC_SECRET` there.
- Only then add `FUND_EASY_SYNC_URL`, `STAIRWAY_SYNC_SECRET` and `FUND_EASY_SYNC_ENABLED=true` here (plus `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` from step 2).

---

## Verification record (2026-10-11, live project nfrdsdnrtsbttyrmfppy, branch phase4-payments)

- Repo migrations (15) match `list_migrations` one-to-one (foundation .. sync_outbox, last version 20261010160412).
- Rolled-back assertion scripts, each run as one `execute_sql` call, all printed "all assertions passed": `security-hardening`, `profiles-rls`, `registrations-rls`, `registrations-rpc`, `payments-schema`, `payments-rpc`, `payments-service`, `sync-outbox`.
- Afterwards: `private.feature_flags` payments = false; outbox 0 rows; payment_orders 0; payment_events 0; no `p3-*`/`p4-*` events or `@test.local` users left; the one live registration and one user untouched.
- Advisors: security shows only the pre-existing Auth "leaked password protection disabled" warning (no new findings). Performance: INFO unused indexes (the two new ones are `payment_events_attention_idx` and `registrations_hold_idx`, expected before any payment) plus the pre-existing `multiple_permissive_policies` WARNs on Phase 1-3 tables (admin + public read policies; `registrations` owner + society-admin read), none from Phase 4 objects.
