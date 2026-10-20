# Hero section editor: eyeball checklist

For the super admin. Nothing here needs SQL. Use a real super admin account; the editor is at `/admin/site/hero`
(also: Admin, Site content, Hero section).

1. **Access.** Signed out, open `/admin/site/hero`: you land on the login page. Signed in as a society admin or a plain
   account: you get the 404 page (no hint that the page exists). As super admin it opens, with "Back to site" first in
   the sidebar.
2. **Presets.** Click each of the four cards (Cobalt Poster, Ink Night, Paper Daylight, Sunrise). The preview on the
   right changes at once. The chosen card shows a "Selected" tag, not just a colour. With a card focused, the arrow keys
   move the choice (Home and End too); Tab leaves the group.
3. **Save and compare.** Pick a preset, press Save ("Saved" appears). Open the home page in another tab and check that it
   matches the preview (colours, motifs, buttons, numbers strip). Repeat for the other presets.
4. **Words.** Choose "My own headline" and type one (max 60). Set a background word (capitals, digits, spaces, max 12;
   lower case is capitalised) and button labels (max 24). Watch the counters. Save, then check the home page. Clear a
   field and save: the default returns (CLIMB, "Claim your step", "Explore the societies"). Try a headline with a
   symbol-only background word like `no!`: a red message appears under the field and focus jumps to it.
5. **Switches.** Turn off "Numbers strip" and "Frame text", save, and check both disappear on the home page.
6. **Reset.** Press "Reset to defaults", confirm in the dialog. The form returns to Cobalt Poster with empty fields and
   the home page shows the original poster again.
7. **Preview honesty.** The preview is marked "sample step and dates": it never shows the real countdown and has no
   working links. Screen reader users hear no second page title from it (the live home page still has exactly one h1).
8. **Phone width.** Open the page at 320px wide (browser dev tools). No sideways scroll; cards stack; Save and Reset are
   at least 44px tall; the preview shrinks to fit.
9. **Conflict.** Open the editor in two tabs. Save a change in tab A. In tab B change something else and Save: a
   "Someone else changed the opening section" message appears with a "Reload the latest" button. Reload shows A's values.
10. **Audit.** `/admin/audit` shows a `site_blocks.update` row (or insert/delete for the first save and a full reset),
    without the headline text.
