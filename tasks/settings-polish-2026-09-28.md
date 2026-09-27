# Settings-area polish (2026-09-28)

Scope: the management/settings screens — Settings, Labour Rates, Users, Tags & Equipment,
Suppliers, Customers. Refinement only: no new features, no layout redesign, no behaviour
change beyond what a step says. The Quality Levels page is out of scope (being removed).

All paths relative to `jobcard-system/client/src/`. Follow CLAUDE.md UI conventions
(spacing tokens only, weights 300/400/700 via tokens, ink vs fill tokens, --border-input on
controls, lucide icon sizes 14/16/18).

## Part A — Settings + Labour Rates

A1. **Labour Rates layout bug.** `.settings-grid` and `.full-width` live only in
    `components/Settings.css`, but `LabourRatesSettings.jsx` (a separate lazy route) uses them
    and never imports that file — opened first, its grid collapses. Move both rules out of
    `Settings.css` into `App.css` (next to the other shared layout primitives, with a one-line
    comment that both Settings and Labour Rates use them). Update Settings.css header comment.
A2. `Settings.jsx` Dark Mode toggle: replace the inline-styled `<label style=...>` with
    `className="toggle-label"` (App.css already defines it). First read `.toggle-label` in
    App.css; if it would visibly change the row (e.g. adds a border/padding box that the
    other rows on the card lack), instead add a small `.settings-toggle` class in
    Settings.css carrying exactly the old inline declarations. Report which you chose.
A3. `Settings.jsx` printers: "Loading printers..." and the "No printers found…" paragraph →
    `className="setting-description"`, no inline style. Use the real ellipsis `…`.
A4. `Settings.jsx` `listStyle`/`hintStyle` objects (≈185-233): delete the objects; add
    `.settings-list` and `.settings-hint` classes to Settings.css using spacing tokens
    (nearest step) and `color: var(--text-secondary); font-size: var(--text-sm);` for the
    hint (no opacity). Apply them where the objects were used.
A5. `Settings.jsx` ≈324-334 import-warning copy: remove every inline style. `fontWeight: 400`
    goes (default). Secondary text → a `.settings-note` class (color --text-secondary,
    font-size --text-sm, margin-bottom --space-3); the `<ul>` → `.settings-note-list`
    (same colour/size, margin `0 0 var(--space-4) var(--space-5)`). The danger line keeps
    `--danger-ink` via a `.settings-note--danger` modifier class.
A6. `Settings.jsx` "Restoring…" overlay: move all inline styles to a `.restore-overlay` class
    in Settings.css. Colours: backdrop uses the same backdrop token/value `.modal-overlay` in
    App.css uses (read it; reuse its variable if one exists, else keep rgba(0,0,0,0.6) with a
    comment); text uses `--text-inverse` if defined in index.css, else keep #fff with a
    comment. z-index: one step above `.modal-overlay`'s value (it must cover the open
    confirm sheet), with a comment saying why. Register it in the modal stack: a
    `useEffect` keyed on `s.importing` calling `pushModal('restore-overlay')` /
    `removeModal('restore-overlay')` from `common/modalStack.js` (read that file to match
    the id convention). Keep the markup, copy and Spinner size as-is.
A7. `components/settings/DataBackupCard.jsx:41` `style={{ marginTop: '1rem' }}` → a class
    `.setting-description--spaced` in Settings.css with `margin-top: var(--space-4)`.
A8. `components/settings/SecurityCard.jsx`: give the inactivity-timeout input a real
    `<label htmlFor="inactivityTimeout">` (turn the existing `.setting-label` div into that
    label, keep its class); give the Prefix input an `id` and link its label with
    `htmlFor`; same for the Starting Number label if unlinked. Replace the three inline
    `style={{ flex: '0 0 auto' ... }}` with one `.job-number-field` class in Settings.css
    (`flex: 0 0 auto`; drop the redundant `alignSelf`). Replace inline widths 120px/160px
    with `.job-prefix-input` / `.job-start-input` classes in Settings.css (same widths — a
    control width is not spacing).
A9. Labour label wiring: `settings/labour/DefaultRateCard.jsx` add `htmlFor="defaultRate"`;
    `settings/labour/MultiplierInputs.jsx` add `htmlFor={key}` (confirm input ids equal
    `key`); `settings/labour/TimezoneCard.jsx` give the select/input an accessible name —
    an `aria-label="Workshop time zone"` (or link an existing visible heading via
    `aria-labelledby` if one has an id).
A10. `settings/labour/ScheduleEditor.jsx` icon-only copy button: `<Copy size={14} />` → 16.
A11. `settings/labour/LabourRates.css`:
     - `.sched-seg--normal/ot1/ot2` backgrounds → `var(--fill-success)`,
       `var(--fill-warning)`, `var(--fill-danger)` with no hex fallbacks (confirm those
       tokens exist in index.css first).
     - Delete the dead `.icon-btn` rules (grep `icon-btn` across src first; `hub-icon-btn`
       is unrelated).
     - `var(--surface-alt, var(--surface))` → `var(--surface)` (token is undefined).
     - Leave the `.paint-cell` rgba hairlines; add a one-line comment that they are
       deliberately theme-independent if none exists.
A12. Button casing: `settings/labour/PublicHolidaysCard.jsx` "Save holidays" → "Save Holidays".
     Scan the other labour cards and Settings cards for button labels in sentence case and
     Title-Case them (buttons and dialog titles are Title Case app-wide). Report each change.

## Part B — Users, Tags, Suppliers, Customers

B1. **Shared flush card body.** Add `.card-body-flush { padding: 0; }` to App.css directly
    after `.card-body`. Replace `style={{ padding: 0 }}` on `.card-body` in
    `UserManagement.jsx`, `SupplierManagement.jsx`, `ContactManagement.jsx` with
    `className="card-body card-body-flush"`.
B2. **Shared helper-text classes.** `.field-note` and `.field-hint` are defined only in
    `components/jobcard/JobCardModal.css` (≈755-770) but used by Customers too. Move both
    rules verbatim to App.css (delete from JobCardModal.css). Add a `.text-muted` rule to
    App.css (`color: var(--text-secondary);`) — it is used by `ContactManagement.jsx:382`
    but defined nowhere. grep for other `text-muted` uses and confirm the rule suits them.
B3. `UserManagement.jsx:261` inline-styled `<p>` → `className="field-note"`.
B4. `UserManagement.jsx:208` add `page-scroll-layout` to the wrapper class list, matching
    Suppliers/Customers. Read App.css `.page-scroll-layout` rules and confirm the Users
    page's markup has the same structure they target (header → card → table); if it
    doesn't, report instead of forcing it.
B5. `UserManagement.jsx:209` page heading "User Management" → "Users" (sidebar says Users;
    siblings use the plain plural).
B6. `UserManagement.jsx` empty state → "No users yet" / "Add your first user to get started."
B7. Stable toast ids on list-load failures: `UserManagement.jsx:65` → `{ id:
    'user-list-load-failed' }`; `TagManagement.jsx:72,87` → `'tag-list-load-failed'`,
    `'machine-list-load-failed'`.
B8. `TagManagement.jsx:165` save fallback → `isFormEquipment ? 'Failed to save machine' :
    'Failed to save tag'` (confirm the variable name).
B9. `TagManagement.css:14` `font-weight: 400` → `var(--font-regular)`;
    `:31` `rgba(239, 68, 68, 0.1)` → `rgba(var(--danger-rgb), 0.1)`;
    `:32` `rgba(34, 197, 94, 0.12)` → `rgba(var(--success-rgb), 0.12)`.
B10. `SupplierManagement.css`: `.tag-chip:hover` border and `.tag-chip.selected`
     background/border → `var(--fill-accent)` (hover of selected → `--fill-accent-hover` if
     it exists); `.tag-delete-btn:hover` background → `var(--fill-danger)`;
     `.custom-tag-input input` border and `.service-tags-selector` border →
     `var(--border-input)`. Confirm each token exists in index.css first.
B11. Customers feedback: `ContactManagement.jsx` `archivePerson` / `restorePerson` add
     `toast.success('Person retired')` / `toast.success('Person restored')` on success,
     placed exactly where the customer archive/restore functions place theirs.
B12. Casing: `ContactManagement.jsx:140` "Archive customer" → "Archive Customer";
     `:208` "Retire this person" → "Retire Person"; `contacts/CompanyPeople.jsx:81,96`
     "Add person" → "Add Person".
