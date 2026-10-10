# Fund Easy patch for the st(AI)rway sync — PROPOSED, NOT APPLIED

```text
##############################################################################
#  NOT APPLIED.  NOT DEPLOYED.  NOT TESTED AGAINST A REAL FUND EASY DATABASE. #
#  Nothing in the Fund Easy repo has been created, changed or built.     #
#  Do not apply until the PRE-CONDITIONS below are done and the user says so.  #
##############################################################################
```

> **Do not apply without the user.** This folder is a ready-to-review copy of the files Fund Easy needs. It was written
> from a read-only study of `C:\fund easy\` (Vite + Supabase project `fidguqathrzitfbpknrd`). Nothing here has been
> run against Fund Easy's database or deployed.

## Pre-conditions (all required, in this order)

1. **Rotate or remove the seeded accounts** on the hosted Fund Easy project: `supabase/seed.sql` in its git history
   contains login-capable accounts with a plaintext password, including the super admin `admin@fundeasy.dev`.
2. **Private backup:** put `C:\fund easy\` in a PRIVATE GitHub repository (it has no remote today). Because the seed
   password is in the history, either rotate first and accept it, or rewrite history before pushing.
3. **Review** this patch (the user, or a reviewer the user names), especially the "Check during review" list.
4. Work on a branch in the Fund Easy repo (e.g. `stairway-sync`); merge only after the tests below pass.

## What it adds

| File (path inside the Fund Easy repo) | Purpose |
|---|---|
| `supabase/migrations/00000000000064_external_sync.sql` | `events.external_source/external_ref`, `ticket_orders.external_source/external_id`, `external_sync_receipts` (idempotency), `external_find_user()`, `import_external_ticket()` (service_role only), guards in `create_ticket_refund()` and `cancel_event()` |
| `supabase/functions/external-sync/index.ts`, `verify.ts`, `verify_test.ts` | Edge Function: HMAC + timestamp check, find-or-create the user, call the RPC, map errors to the contract's statuses |
| `supabase/config.toml` (append `config.toml.snippet`) | `verify_jwt = false` for `external-sync` (it authenticates with the HMAC) |
| `supabase/tests/database/042_external_sync.test.sql` | pgTAP tests (sketch; adjust ids/plan count when applying) |

## Apply (after the pre-conditions)

1. Copy the files into the Fund Easy repo at the paths above; append `config.toml.snippet` to `supabase/config.toml`.
2. Local: `supabase db reset` then `supabase test db` (pgTAP) and `deno test supabase/functions/external-sync/`.
3. Hosted: apply the migration (`supabase db push` or the MCP `apply_migration` on project `fidguqathrzitfbpknrd`);
   `supabase secrets set STAIRWAY_SYNC_SECRET=<32+ random chars>`;
   `supabase functions deploy external-sync --no-verify-jwt`.
4. Manual test from `docs/integrations/fund-easy-sync.md` → 200 `ignored`.
5. On st(AI)rway (Cloudflare secrets): `FUND_EASY_SYNC_URL=https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync`,
   `STAIRWAY_SYNC_SECRET=<same value>`, `FUND_EASY_SYNC_ENABLED=true` (plus `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
   Queued messages start flowing on the next 5-minute tick.

## Rollback

Set `FUND_EASY_SYNC_ENABLED` off on st(AI)rway (messages stay queued). On Fund Easy, `supabase functions delete
external-sync`; the added columns/table are inert without it. Imported rows are ordinary tickets/orders tagged
`external_source = 'stairway'`.

## Check during review

- `reserve_ticket` and `public_event_tiers` skip inactive tiers (verified in migrations 054/061), so the `st(AI)rway`
  tier is never sold on Fund Easy. Confirm the Fund Easy UI also hides it.
- Fund Easy's `razorpay-webhook` receives st(AI)rway's events too (shared Razorpay account). Before a sync it ignores
  our order ids (unknown); after a sync `confirm_ticket_order` finds an already-`paid` order with the same payment id
  and returns without side effects. Our refund notes use `source`/`registration_id`, never `refund_id`, so its refund
  lookup ignores them. Re-verify against the current webhook code.
- Synced events are `published` (organisers can manage and scan them) but have no buyable tier.
- A re-confirmation after a cancel keeps the first receipt on Fund Easy (receipts are one per order).
- Check-ins done on Fund Easy are not sent back to st(AI)rway (reverse sync is out of scope).
