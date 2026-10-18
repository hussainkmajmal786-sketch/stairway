# Admin dashboard: what you check yourself (Phase 5)

Nothing here needs secrets. Do these signed in, on a machine with internet.

## Walkthrough
1. Sign in as yourself, open `/admin`. Sidebar: BACK TO SITE first, then Overview, Events, Society, Site content, Admins, Audit log, Settings. Overview loads.
2. Events, New: create a draft (title, date, venue, capacity 5). Upload a poster from your phone. Add 2 custom questions and a video URL. Publish. Open the public event page and register with a second account; it appears under Registrations.
3. Registrations: search; open Details (email and phone visible); Export CSV and open it in Excel or Sheets (no cell starting with `=` executes); cancel the test registration; raise capacity and use Promote from waitlist if someone is queued.
4. Phone scanner: open the event's Check-in page on an Android phone (Chrome) and on an iPhone (Safari). Scan the ticket QR from the other account's `/me/tickets/<id>`: green "Checked in". Scan again: amber "Already checked in". Type the token: it asks you to confirm the person.
5. Invites: Admins, invite a second Google account as society admin of one society. Open the link in a private window with the WRONG Google account: it must fail with the generic message. Then the right account: it lands on `/admin` with the limited nav. Reload `/admin/people` as super admin: the link is gone and the invite is no longer pending. Try the link again: generic failure.
6. As that society admin: `/admin/site`, `/admin/people`, `/admin/audit`, `/admin/settings` and another society's events all give a 404. Reordering a list of more than 40 items is refused with a clear message.
7. Audit log shows each of the above (who, what, when) and no emails or phones. Try the filters and paging.
8. Settings: payments show Off/Missing; Refund buttons are disabled with an explanation.
9. Cancel the test event (type its title): registrations become cancelled; a paid seat, if any, shows "refund needed".
10. Optional: erase a throw-away user (People, Erase, type handle). They can no longer sign in; their ticket/receipt row still exists.
11. Cleanup: remove the test admin role and any pending invite.

## Workers plan note
The Free Workers plan allows 10 ms CPU and 50 subrequests per request. If any admin page shows Cloudflare error 1102, see `.superpowers/sdd/incident-1102.md`; Workers Paid removes the limit. Admin pages are paginated and lists reorder at most 40 items per call for this reason.

## Live verifications that could not be run offline (do before relying on the dashboard)
- Run the RLS suite (`npx vitest run tests/rls`) and every `supabase/tests/*.sql` script against the live DB; each must end `all assertions passed`.
- Signed upload tokens: confirm a media upload URL cannot be used for another path, another society's folder or after it expires.
- Admin RPC scoping: as a society admin, call the registrant, check-in and cancel RPCs for another society's event; all must be refused.
- Real response headers: `curl -I` on `/invite/<43 chars>` shows `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`; `/admin` and `/admin/events` redirect when signed out; `/robots.txt` lists `/admin/` and `/invite/`.
- Analytics scrubbing: with GA on, open `/invite/<token>` and a ticket page; in GA DebugView `page_location` must read `/invite/:token` and `/me/tickets/:id`.
- Avatar path convention: avatars live at `<user id>/<file>` in the `avatars` bucket (anonymisation deletes that prefix); after erasing a test user the folder must be empty.
- The login and auth callback must not log query strings (the invite token rides in `?next=`).

## Deferred (known, accepted for now)
- M-4: the event slug lock can be bypassed by unpublishing first.
- The `media` bucket allows 100 MB and PDFs for all kinds; the 5 MB image cap is not enforced by the bucket.
- Refund has no server-side typed confirmation (the dialog is UI only; super admin only and idempotent).
