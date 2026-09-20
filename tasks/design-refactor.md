# Design refactor — items 1–10

Frozen spec. Executors implement exactly this. Anything that cannot be done as
written is reported back, not improvised.

Root for every path below: `jobcard-system/client/src/`.

---

## Frozen values

### New colour tokens (item 1) — `index.css`

Readable ink for the three signal colours. These are NOT new hues: every value is
already in the file, inside the status/badge palettes. We are extending the proven
pairing to the rest of the app.

| Token | `:root` (light) | `.dark-mode` |
|---|---|---|
| `--success-ink` | `#166534` | `#86efac` |
| `--warning-ink` | `#92400e` | `#fcd34d` |
| `--danger-ink`  | `#b91c1c` | `#fca5a5` |

Contrast, verified: light ink clears 4.5:1 on all four surfaces (worst 5.67 / 6.21 /
6.25) and on the 10–16% tinted chips (worst 5.55). Dark ink clears 7.1:1 everywhere.

### New fill tokens (item 2) — `index.css`, in `:root` ONLY (identical in both themes)

A fill that carries white text must be dark enough in BOTH themes, so these do not
get a `.dark-mode` override. Do not add one.

| Token | Value | With its ink |
|---|---|---|
| `--fill-accent`       | `#2563eb` | `#ffffff` — 5.17:1 |
| `--fill-danger`       | `#dc2626` | `#ffffff` — 4.83:1 |
| `--fill-success`      | `#15803d` | `#ffffff` — 5.02:1 |
| `--fill-warning`      | `#f59e0b` | `--fill-warning-ink` |
| `--fill-warning-ink`  | `#451a03` | on amber — 6.97:1 |

Warning keeps the amber fill on purpose — amber *is* the caution signal, and darkening
it to brown to carry white text would lose that. It takes near-black ink instead, the
same move the same-day pill already makes.

### Contrast corrections to existing tokens (item 1) — `index.css`

| Token | From | To | Why |
|---|---|---|---|
| `--sidebar-text-muted` (`:root`) | `#5a6d8a` | `#748aa8` | was 3.18:1 on the sidebar |
| `--text-tertiary` (`.dark-mode`) | `#7688a3` | `#8296b0` | was 4.00:1 on raised surfaces |
| `--status-invoiced-text` (`:root`) | `#64748b` | `#5b6878` | was 4.42:1 on its own tint |

### Text weight scale (item 3) — `index.css`

Only three faces are bundled: Light 300, Book 400, Bold 700. Weights 500 and 600 have
no file, so the browser already renders 500 as 400 and 600 as 700. The four-name scale
is fiction. Replace it with the three weights that exist.

```
--font-light: 300;
--font-regular: 400;
--font-bold: 700;
```

DELETE `--font-medium` and `--font-semibold`. Per the project's no-compatibility rule,
do not alias them — remove every use.

### Radius token (item 9 support) — `index.css`

Add `--radius-full: 999px`. It is already referenced twice with a fallback and never
defined.

---

## Executor A — `index.css` only

1. Add the three ink tokens to `:root` and `.dark-mode` (values above), beside the
   existing `--success-color` / `--warning-color` / `--danger-color` block. Comment
   them: fills are for shapes, ink is for words.
2. Add the five fill tokens to `:root` only.
3. Apply the three contrast corrections above.
4. Replace the weight scale as above. Update the two in-file uses if any.
5. Add `--radius-full: 999px`.
6. **Item 4 — browser surfaces.** Add:
   - `color-scheme: light` on `:root`, `color-scheme: dark` on `.dark-mode`. This is
     the single line that fixes native scrollbars, dropdown arrows and date pickers.
   - `::selection` using the accent at low alpha with `--text-primary` ink.
   - `caret-color: var(--primary-accent)` on inputs/textareas.
   - `accent-color: var(--primary-accent)` on `:root` so every checkbox and radio
     picks up the app blue. The one local copy at `JobCardModal.css:616` then goes
     (Executor D removes it).
   - Webkit scrollbar styling driven by `--border-strong` / `--surface-inset`, thumb
     rounded with `--radius-full`, and `scrollbar-color` for Firefox. Keep it subtle.
7. `index.css:543` `.field-error-message` → `color: var(--danger-ink)`.
8. **Delete the 16 dead `--status-*-dot` tokens** (8 per theme). Nothing reads them;
   Executor B removes the 8 `--s-dot:` assignments that feed them.
9. Leave the `Pragmatica-Light` `@font-face` in place — it is now used (see D/C).

Do not touch any other file.

---

## Executor B — `App.css` only

**Item 1 — ink swaps.** At these lines, the colour is being used for *words*, so it
becomes ink. Change the value only; touch nothing else in the rule.

| Line | From | To |
|---|---|---|
| 743 | `var(--accent-caution)` | `var(--danger-ink)` |
| 807 | `var(--danger-color)` | `var(--danger-ink)` |
| 1762 | `var(--accent-caution)` | `var(--danger-ink)` |
| 1782 | `var(--accent-caution)` | `var(--danger-ink)` |
| 2024 | `var(--danger-color)` | `var(--danger-ink)` |

**Item 2 — buttons.** In `.btn-primary`, `.btn-action`, `.btn-danger`, `.btn-warning`,
`.btn-success`, `.btn-icon.danger`:
- background becomes the matching `--fill-*` token
- text becomes `#fff` — except `.btn-warning`, which takes `var(--fill-warning-ink)`
- DELETE the `.dark-mode .btn-danger` / `.btn-warning` / `.btn-success` override block
  that follows (around line 456): the fills are now theme-independent, so the override
  is dead. Removing it is the point, not a side effect.
- `.btn-primary:hover` keeps its lift; update its glow rgba to the fill colour.

**Item 3 — weights.** Replace every `font-weight` in this file: `500`/`var(--font-medium)`
→ `var(--font-regular)`; `600`/`var(--font-semibold)` → `var(--font-bold)`; bare `400`
→ `var(--font-regular)`; bare `700` → `var(--font-bold)`.
Then two deliberate changes:
- `.table th` (~line 866): weight becomes `var(--font-regular)`. Table headings are
  13px, secondary-coloured, on a raised band with a strong rule under them — they do
  not also need to be bold, and dropping them lets the rows read first.
- `.inactivity-countdown` (~line 1780): weight becomes `var(--font-light)`. A 4rem
  numeral is the one place the Light face earns its keep.

**Item 8 — dark-mode hover.** Line ~1900: `var(--surface-hover, rgba(0,0,0,0.05))` →
`var(--surface-inset)`. `--surface-hover` is never defined, so the black fallback always
won and did nothing visible in dark mode.

**Item 9 — stripes.**
- Line ~1422: delete the `border-left: 3px solid var(--page-accent)` and its
  `padding-left` from the page-title rule. Keep the selector if it still carries
  something; otherwise remove the empty rule.
- Line ~1819 `.custom-toast`: `border-left: 4px` → `2px`. The toast already carries a
  coloured icon; the slab is redundant weight.
- While here: the `--page-accent` block (~1391–1414) sets the identical value for all
  five pages in each theme, and the only two consumers are the stripe being deleted and
  the header button. Replace both consumers with `--fill-accent` / `--primary-accent`
  and delete the `--page-accent*` blocks entirely.

**Item 10 — targets.** `.badge-clickable` (~950): add `min-height: 24px` and enough
block padding to reach it. Do not change the font size.

**Item 6 support.** `.toast-dismiss` (~1838): give it `display:inline-flex`,
`align-items:center`, `justify-content:center`, `min-width:24px`, `min-height:24px`,
`border-radius: var(--radius-full)`, and a hover background of `var(--surface-inset)`.
Add `gap: 0.625rem` to `.toast-content` — icon and message currently touch.

**Item 1 cleanup.** Delete the 8 `--s-dot: ...` assignments in the status block
(~1035–1066). Nothing reads them.

Do not touch any other file.

---

## Executor C — these files only

`components/JobCardList.css`, `components/Statistics.css`,
`components/jobcard/JobPaperworkHub.css`, `components/jobcard/StopTimerForm.css`,
`components/settings/labour/LabourRates.css`, `components/common/DataTable.css`,
`components/common/CheckboxDropdown.css`, `components/common/EmptyState.css`,
`components/Login.css`

**Item 1 — ink swaps.** Every one of these is the colour being used for words:

| File:line | To |
|---|---|
| `JobCardList.css:156` | `var(--warning-ink)` |
| `JobCardList.css:168` | `var(--danger-ink)` |
| `JobCardList.css:205` | `var(--success-ink)` |
| `JobCardList.css:219` | `var(--danger-ink)` |
| `JobCardList.css:520` | `var(--danger-ink)` |
| `JobCardList.css:598` | `var(--success-ink)` |
| `Statistics.css:415` | `var(--danger-ink)` |
| `StopTimerForm.css:164` | `var(--danger-ink)` |
| `StopTimerForm.css:263` | `var(--danger-ink)` |
| `JobPaperworkHub.css:426` | `var(--danger-ink)` |

Leave the tinted backgrounds on those rules as they are — the new ink clears 4.5:1
against them (verified at 10%, 14% and 16%).

Also `Login.css`: the placeholder at `rgba(148,163,192,0.5)` and the input icon at the
same value are ~2.4:1 on the dark card. Raise both to `rgba(148,163,192,0.75)`.

**Item 2.** `Statistics.css` `.preset-pill.active` uses `color:#fff` on
`var(--primary-accent)` — in dark that is 3.68:1. Point the background at
`var(--fill-accent)`.

**Item 3 — weights.** Same sweep as B across all nine files. Plus:
- `Statistics.css` `.kpi-title` → `var(--font-regular)` (it is already uppercase,
  wide-tracked and secondary-coloured; bold on top of that is three signals for one job).
- `StopTimerForm.css:229` `.stf-counter--hero .stf-count-input` → `var(--font-light)`.
  Second and last use of the Light face: a 2.25rem mechanical readout.

**Item 8.** `Statistics.css:78` already has a dark override — leave it.

**Item 9.** `Statistics.css:137` `.kpi-card::before`: delete the rule and the four
`.kpi-card.<x>::before` colour lines under it. The cards already have a title, an icon
chip and a border; the top slab is the tell.
`Statistics.css` `.kpi-icon` background `rgba(37,99,235,0.1)` is nearly invisible on
dark navy — change to `rgba(var(--accent-rgb), 0.12)` so it follows the theme. Do the
same for the three sibling `.kpi-card.<x> .kpi-icon` tints using the matching
`--*-rgb` tokens.

**Item 10 — targets.** Each of these is a real button below 24px. Keep the icon size;
grow the box with padding so nothing reflows:

| File:line | Element | To |
|---|---|---|
| `LabourRates.css:215` | holiday remove cross (~17px) | min 24×24 |
| `JobPaperworkHub.css:489` | photo remove (18px) | min 24×24 |
| `JobCardList.css:316` | compact assignee circle (22px) | keep the circle 22px, give the wrapping trigger min 24×24 |
| `JobCardList.css:375` | assignee chip (28px) | min 28 is acceptable; leave |

**Item 4 support.** `JobPaperworkHub.css:510` `.hub-doc-frame { background:#fff }` is a
hard white rectangle inside the dark theme. Leave the white — it frames a white
document — but give it a `--border-color` border so it does not float.

**Type sizing.** `LabourRates.css:120` `font-size: 10px` → `var(--text-2xs)`.

Do not touch any other file.

---

## Executor D — `components/jobcard/JobCardModal.css` only

**Item 1 — ink swaps.** These lines use the colour for words:

`686` → `var(--success-ink)` · `1097` → `var(--danger-ink)` · `1322` → `var(--warning-ink)`
· `1348` → `var(--warning-ink)` · `1576` → `var(--success-ink)` · `1589` → `var(--success-ink)`
· `1986` → `var(--success-ink)` · `2255` → `var(--success-ink)` · `2298` → `var(--success-ink)`
· `2332` → `var(--success-ink)` · `2460` → `var(--success-ink)` · `2464` → `var(--danger-ink)`
· `2772` → `var(--warning-ink)` · `3260` → `var(--warning-ink)` · `3389` → `var(--danger-ink)`

**Item 3 — weights.** Same sweep. Plus `.cb-table thead th` (~2583) → `var(--font-regular)`
and its `font-size: 0.5625rem` → `var(--text-2xs)`. 9px uppercase grey on the pricing
screen is below readable.

**Item 4.** Delete the local `accent-color` at ~616 — it is global now.

**Item 8.** `.tab:hover` (~427): `rgba(0,0,0,0.03)` → `var(--surface-inset)`. This is
the job screen's tab strip and the hover currently does nothing in dark mode.
Line ~1012: `var(--surface-hover, rgba(0,0,0,0.06))` → `var(--surface-elevated)`.

**Item 9.**
- `.note-card` (~3856): delete `border-left: 3px solid var(--primary-accent)`. Purely
  decorative.
- `~2346`: this stripe plus gradient is decorative too — delete the `border-left` and
  flatten the gradient to a single `color-mix` background. Keep the rule's radius.
- **Do NOT touch the `.lip-summary` stripe at ~1524.** Its colour is state — idle,
  started, active, partial. That one is information, not decoration, and it stays.

**Item 10.** `.costing-info-btn` (~2490) 26×26 → min 28×28.
`.line-item-remove` (~1076) and `.te-menu-btn` (~2110) are 28×28 — acceptable, leave.
`.checkbox-inline input[type=checkbox]` (~612) 18px → 20px with the label keeping a
24px min-height hit area.

**Item 2.** `.tab-badge` (~437): background → `var(--fill-accent)`, colour → `#fff`
(it currently uses `var(--surface)`, which is dark navy on blue in dark mode, 3.2:1).
Radius → `var(--radius-full)`; it is an 18px pill drawn with an 8px corner.

**Borders.** `.form-section` (~467) uses `border: 2px solid var(--border-strong)` —
the heaviest border in the app on a plain grouping box. Drop to
`1px solid var(--border-color)` to match every other container.

Do not touch any other file.

---

## Executor E — motion and icons (JSX)

**Item 5 — remove the two permanent animations.**
- `components/common/PageHeader.jsx`: render the title as plain text. Drop the
  `ShinyText` import.
- `components/Layout.jsx`: remove the `ClickSpark` wrapper (open and close tags, line
  ~89 and ~273) and its import. Keep everything inside it exactly as is.
- `components/Login.jsx`: replace `GradientText` on the title with plain text.
- Then DELETE `components/common/ShinyText.jsx`, `ShinyText.css`,
  `GradientText.jsx`, `GradientText.css`, `ClickSpark.jsx` — and any CSS import of
  them. The project rule is that replaced code is removed, not left for reference.
  Verify with a repo-wide search that nothing else imports them before deleting.
- Leave `Waves.jsx` alone: it is rendered with `staticRender`, so it does not animate.

**Item 6 — one icon scale.** Normalise the `size={...}` prop on lucide icons:
`12` → `14`, `13` → `14`, `15` → `16`. Leave `14`, `16`, `18` as they are. Leave
`20`, `24`, `32`, `40` alone — those are deliberate large uses. ~46 call sites.
Fix `components/JobCardListTable.jsx:50-53` specifically: the unsorted arrow is 12 and
the sorted arrows are 14, so the icon resizes when you sort. All three become 14.

**Item 6 — drawn icons instead of typed characters.** 18 sites.
- Toast calls already pass an `icon:` option, so the character becomes an element.
  **Most of these sites are plain `.js` hook files, which cannot contain JSX here** —
  the build only transforms `.jsx`, and the project's naming rule keeps hooks as
  `use*.js`, so renaming them is not an option.
  Create `components/common/toastIcons.jsx` exporting ready-made elements:
  `export const warningToastIcon = <AlertTriangle size={16} />;` and
  `export const discardToastIcon = <Trash2 size={16} />;`
  Then each call site imports the element and writes `icon: warningToastIcon`. This
  keeps the hooks as `.js`, keeps the naming convention, and puts the toast icon look
  in one place.
  Sites: `JobCardModal.jsx:392`, `useCosting.js:181,281`, `useJobCardCosting.js:104`,
  `usePacketPrint.js:17,22,128,170`, `useTimer.js:218,251`.
- Inline glyphs: `tabs/LineItemTagSelect.jsx:36,42,44,51,139` (⚠ and ✓),
  `tabs/LineItemProgress.jsx:64` (✓) and `:184` (▾), `tabs/ScrapStat.jsx:23` (⚠) →
  the matching lucide icon at `size={14}`, `aria-hidden` where a text label sits beside it.
- `App.jsx:111`: the `✕` dismiss becomes `<X size={14} />`.

**Item 6 — one loader.** There are five separate spinner builds doing the same 360°
rotation. Create `components/common/Spinner.jsx` + `Spinner.css` exporting a single
spinning `Loader2` (1s linear infinite, honouring `prefers-reduced-motion`, size via
prop defaulting to 16), and replace the five spinner uses (`ExportButton.jsx:53`,
`HubFileRow.jsx:53,62,71,84`, `statistics/StatisticsHeader.jsx:32`, the inline
`<style>` ring in `Settings.jsx:368-386`) with it. Delete the now-unused keyframes and
classes in the CSS files those components own — `ExportButton.css`,
`JobPaperworkHub.css` (`hub-spin`), `Statistics.css` (`stats-spin`) — and the inline
`<style>` block's spinner half in `Settings.jsx`. Leave the skeleton shimmer alone;
it is a different thing.

**Item 3 in JSX.** Seven inline styles set a text weight that has no font file, so
they render as something other than what they say. Normalise them the same way as the
stylesheets — 500 → 400, 600 → 700, and leave `'bold'` alone:
`ActivityLog.jsx:34`, `Settings.jsx:316,326`, `SearchPage.jsx:72`,
`jobcard/tabs/ActivityLogTab.jsx:8`.

**Bug found in passing.** `Settings.jsx:326` sets `color: 'var(--danger)'`. No such
token exists — the correct name is `--danger-color`, and this one is now
`--danger-ink` since it is colouring words. Fix it to `var(--danger-ink)`.

**Toast icon colours.** `App.jsx:69` reads the theme colours once at first render and
never again, so toast icons keep light-theme values forever. Drop the `getCssVar`
helper and the `iconTheme` blocks entirely — the toast already carries a coloured left
border and themed text, and the library's default icons inherit fine.

Do not edit any `.css` file owned by A–D. If a change needs one, report it.

---

## Executor F — notifications (item 7). Runs AFTER E.

**F.1 — inline field errors.** `index.css` already styles `.field-error` (on the group)
and `.field-error-message` (the text). Nothing uses them. Wire them.

Add `hooks/useFieldErrors.js`:
- state: an object of `{ fieldName: message }`
- `setFieldErrors(obj)`, `clearFieldError(name)`, `clearAll()`
- `groupClass(name)` → `'form-group field-error'` or `'form-group'`
- `errorFor(name)` → the message string or null

Then convert these 17 submit-time validations from a pop-up to a field mark. Each one
sets the error on the named field, scrolls it into view if off-screen, and clears on
the next change to that field:

`UserManagement.jsx:63` · `QALevelManagement.jsx:51,84` · `Statistics.jsx:73,78` ·
`common/InlineSupplierForm.jsx:34` · `jobcard/useTimeEntries.js:70,76` ·
`hooks/useLabourRates.js:179` — plus the remaining "required / please / must be"
validation errors in those same files.

Keep the wording exactly as it is. Only the delivery changes. Do NOT also fire the
toast — two channels for one message is the bug.

Server failures and anything not tied to a named field stay as pop-ups.

**F.2 — progress for slow actions.** Wrap the four long operations in
`toast.promise` (or a loading toast that resolves), so something shows *during* the
wait rather than only after: the Excel export (`common/ExportButton.jsx`), the
statistics export (`statistics/StatisticsHeader.jsx`), the file upload
(`jobcard/useJobFiles.js`), and the backup export/import (`settings/DataBackupCard.jsx`).
Keep the existing disabled-button-with-changed-label behaviour; the message is in
addition to it, not instead.

**F.3 — stop pop-ups stacking.** Give a stable `id` to the repeated messages so a
second one replaces the first: `Failed to update status` (4 sites),
`Failed to stop timer` (2), `Failed to start timer` (2), `Failed to delete job card` (2),
`Timer stopped` (2), `Could not load the customer list` (2), `Customer added` (2).

**F.4 — the one raw error leak.** `common/ExportButton.jsx:38` falls through to
`String(err)`, which can print a raw technical error at the user. Give it a plain
fallback sentence like the rest of the app does.

**F.5 — wording.** Five messages in `hooks/useSettings.js` (lines ~108, 150, 167, 198,
227) end in "successfully"; the other sixty-plus success messages do not. Drop the
word so they match. Do not change their meaning.

---

## Gate — every executor

- Only the files your section names. A change needed outside them is reported, not made.
- Removing a guard, check or comment needs a reason stated in this spec. None of the
  above removes one except where it says so explicitly and why.
- Reordering calls is a behaviour change. "Replace in place" means same position.
- Finish with `git diff --stat` pasted into your report, plus a one-line note per
  numbered step saying done / not done / why.
