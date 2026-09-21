# Frozen spec — app-wide layout sweep

Scope: spacing, rhythm, grouping and visual hierarchy across the whole client.
Nothing else changes. No colour, type, copy, behaviour or data changes.

The spacing system lands in `client/src/index.css` (the `Spacing — the steps,
then the jobs they do` block) as part of this change. Once it is in, index.css
is off limits for the rest of the sweep — a work order that needs a value the
scale doesn't carry reports it rather than adding a step.

## 1. The scale

```
--space-0-5  2px    --space-3   12px    --space-8   32px
--space-1    4px    --space-4   16px    --space-10  40px
--space-1-5  6px    --space-5   20px    --space-12  48px
--space-2    8px    --space-6   24px
--space-2-5 10px    --space-7   28px
```

Role tokens (prefer these over a raw step wherever the role fits):

```
--gap-inline    6px   icon <-> label, a chip's own padding
--gap-tight     8px   controls acting as one cluster
--gap-field    12px   fields in a group; a heading and its content
--gap-group    20px   groups inside a section
--gap-section  32px   section to section
--lead-heading 24px   space ABOVE a heading
--pad-control  8px 12px
--pad-card     20px
--pad-page     28px
--pad-cell      8px 16px   (the one table density, app-wide)
```

## 2. Conversion table — apply to EVERY literal

Applies ONLY to `margin*`, `padding*`, `gap`, `row-gap`, `column-gap`.
Never to width, height, min/max-*, border-radius, border-width, font-size,
line-height, top/right/bottom/left, inset, flex-basis, transform or translate.
`0`, `auto`, `%`, `em`, `vh/vw`, `calc(...)` and `var(...)` are left alone.

| literal | becomes |
|---|---|
| 0.05rem, 0.0625rem, 1px, 0.1rem, 0.125rem, 2px, 0.15rem, 0.18rem | `var(--space-0-5)` |
| 0.1875rem, 3px, 0.2rem, 0.25rem, 4px, 0.3rem | `var(--space-1)` |
| 0.32rem, 0.35rem, 5px, 0.375rem, 6px, 0.4rem, 0.42rem | `var(--space-1-5)` |
| 0.45rem, 7px, 0.5rem, 8px, 0.55rem | `var(--space-2)` |
| 9px, 0.5625rem, 0.6rem, 0.625rem, 10px, 0.65rem | `var(--space-2-5)` |
| 0.7rem, 11px, 0.75rem, 12px, 0.8rem, 0.85rem, 0.875rem, 14px | `var(--space-3)` |
| 0.9rem, 0.95rem, 1rem, 16px, 1.05rem, 1.1rem | `var(--space-4)` |
| 1.15rem, 1.25rem, 20px, 1.35rem | `var(--space-5)` |
| 1.5rem, 24px, 1.625rem, 26px | `var(--space-6)` |
| 1.75rem, 28px, 1.85rem | `var(--space-7)` |
| 1.9rem, 2rem, 32px, 2.25rem, 36px | `var(--space-8)` |
| 2.5rem, 40px, 2.75rem, 44px | `var(--space-10)` |
| 3rem, 48px | `var(--space-12)` |

Anything above 48px, or not in this table, is reported in your write-up and
left alone — do not invent a mapping.

Where the value's role is one of the role tokens above, use the ROLE token
instead of the raw step (e.g. a flex `gap` between an icon and its label
becomes `var(--gap-inline)`, not `var(--space-1-5)`). Gaps between form
sections become `var(--gap-section)`. Use judgement, but never invent a new
number.

**Guard:** if a rule's padding changes and the same rule (or its element)
also sets a fixed `height`, `min-height` or `line-height` that the old
padding was sized against, keep the box the same total height — adjust or
report it. Do not silently let a control change height.

## 3. Structural fixes (per area, listed in the work orders)

- A heading takes `--lead-heading` above and `--gap-field` below. Headings
  that currently have only a `margin-bottom` get the top space added.
  Exception: a heading that is the first child of its container gets no top
  space (the container's own padding already provides it).
- Prefer space over a border for grouping. Where a bordered box sits
  directly inside another bordered box which sits inside a third, remove the
  MIDDLE one, as named per area.
- One table density everywhere: every table cell uses `--pad-cell`.

## 4. Gate — every work order ends with this

- Only the files listed in your order may change. `git status --porcelain`
  must list nothing else.
- Paste `git diff --stat` for your files.
- Report the count of literals converted, and list every value you could not
  map with the reason.
- Report every rule where you kept a box's height by adjusting something
  other than padding.
- A step that cannot be done as written is reported, not improvised.
