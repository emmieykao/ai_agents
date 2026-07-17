# Inkwell — design system

The web UI is styled as **Inkwell**: an AI scrivener that writes your
paperwork in front of you. Every visual decision comes from the world of fine
stationery — a desk, sheets of paper, ink, and a seal.

## Concept

- The page background is a **limestone desk** with a faint paper grain
  (an inline SVG turbulence texture on `body`).
- The three panels are **sheets of paper** resting on it (`.sheet`).
- Text the *user* reads is set in iron-gall blue-black ink.
- Everything the *agent writes* — field values, metadata, the typewriter
  fill — is set in monospace, in fountain-pen blue.
- **Red appears exactly once**: the cinnabar `FILED` seal stamped on a form
  when a fill completes. Red = done, like a notary's stamp.

There are two lightings of the same desk. **Day** is the limestone-and-blue
scheme above. **Night** is the desk by lamplight: navy paper, parchment
text, **gilt** for the agent's pen, silver for the margins. The theme
follows the OS preference until the user picks one with the day/night
toggle in the letterhead (persisted as `inkwell:theme`, applied pre-paint
by a head script in `layout.tsx` to avoid flashing). Rendered PDF pages
stay white in both themes — documents are physical paper, unaffected by
the room's lighting.

## Tokens

Defined in [app/globals.css](app/globals.css) as CSS custom properties, and
mapped to Tailwind utilities via `@theme inline` (`bg-sheet`, `text-ink`,
`border-line`, `text-pen`, `text-seal`, …).

| Token | Day | Night | Role |
| --- | --- | --- | --- |
| `--desk` | `#e9e6dd` | `#0c121d` | Page background (the desk) |
| `--sheet` | `#fdfcf7` | `#131c2b` | Panel surfaces (sheets of paper) |
| `--sheet-tint` | `#f4f2e9` | `#1a2536` | Inset areas: selects, code, activity panel |
| `--ink` | `#232830` | `#e7e3d5` | Primary text, primary buttons |
| `--ink-soft` / `--ink-faint` | `#5f6572` / `#8d919b` | `#9aa4b2` / `#707b8c` | Secondary / tertiary text |
| `--line` / `--line-strong` | `#dcd8ca` / `#b9b4a2` | `#253044` / `#3a475f` | Hairlines and rules |
| `--pen` | `#2b4a9e` (fountain blue) | `#d3ad5f` (gilt) | The agent's pen: written values, links, focus, live states |
| `--seal` | `#b23a2a` | `#d65c46` | Completion seal, errors, required markers |
| `--amber` | `#8a670f` | `#c08a5a` | "Not found in the document" marginalia |
| `--grain` | dark noise | light noise | Paper grain over the desk |
| `--seal-blend` | `multiply` | `normal` | How the seal inks onto the sheet |

Night values live in two places that must stay identical: the
`prefers-color-scheme: dark` media block (OS preference) and the
`:root[data-theme='dark']` block (explicit toggle choice).

## Type

Three faces, three jobs (loaded in [app/layout.tsx](app/layout.tsx) via
`next/font`):

- **Newsreader** (`font-display`) — headings, the wordmark, the agent's
  chat prose, and italic empty states. The voice of the studio.
- **Schibsted Grotesk** (`font-sans`) — UI labels, body copy, buttons.
- **IBM Plex Mono** (`font-mono`) — everything mechanical or machine-written:
  field values, file sizes, dates, status lines, the typewriter fill.

The serif/mono split is semantic: if the machine wrote it, it's mono.

## Signature elements

- **The FILED seal** (`FiledSeal` in
  [components/form-viewer-panel.tsx](components/form-viewer-panel.tsx)) — a
  rotated cinnabar stamp with the filled-field count, pressed onto the sheet
  with a `stamp-in` overshoot animation and `mix-blend-multiply` so it reads
  as ink on paper. It doubles as the link to the completed file.
- **Ruled fields** — JSON forms render as real paper forms: each value sits
  on a hairline baseline that turns pen-blue while being written.
- **The letterhead** — wordmark, italic tagline, live status
  (`READY` / `THE AGENT IS WRITING`), and a rule that draws itself on load.

## Motion

All defined in `globals.css`; everything respects `prefers-reduced-motion`.

- `settle` — panels rise onto the desk on load, staggered ~60 ms.
- `rule-draw` — the letterhead rule draws left-to-right.
- `rise-in` — filled values enter during the replay.
- `stamp-in` — the seal presses down (scale 1.7 → 0.93 → 1).
- `ink-pulse` — live indicators breathe instead of spinning where possible.

## Iconography

No emoji. All glyphs are 16-unit monochrome line drawings at a single stroke
weight (1.4) in [components/icons.tsx](components/icons.tsx), colored by
role: faint for idle, pen for active, amber for skips, seal for done/errors.

## Tests

`npm test` runs Playwright smoke tests ([tests/smoke.spec.ts](tests/smoke.spec.ts))
against a dev server on port 3199: panel rendering, forms list, selection
sync, document auto-selection, mobile stacking, and preference persistence.
The fill flow itself requires the model API and is exercised manually.
