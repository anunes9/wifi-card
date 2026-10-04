# Next.js migration: design

Date: 2026-10-04
Branch: `nextjs-migration`
Status: approved in conversation, waiting for review of this written spec

## Goal

Move the WiFi card generator from a hand-written static page (`index.html`, `css/style.css`, `js/qr.js`, `js/app.js`, inlined by `build.py`) to Next.js 16 with React 19 and TypeScript. The aim is **maintainability**: replace the 585-line imperative `app.js` with typed, testable modules and small React components.

## Success criteria

1. Users see and use the app exactly as before: the editor, the CSV paste import (all three modes), both card designs, the options, the warnings, and Copy as CSV.
2. Printed output matches today's pixel for pixel: A4 portrait, two A5 landscape cards per sheet, and no blank trailing page.
3. Data already saved in `localStorage` (key `lisbeyond.wificards.v1`) loads unchanged. The app writes data in the same shape.
4. The app still runs entirely in the browser, with no network calls at run time and no server code.
5. The logic modules are covered by unit tests, and the QR encoder gives the same output as the current one.

## Non-goals

- No visual redesign, Tailwind, CSS Modules or UI kit.
- No backend, API routes, authentication or shared storage.
- No new features.
- Keeping a single self-contained HTML file is not required. A deployable folder is fine.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Framework | Next.js 16.3 (App Router), React 19, TypeScript strict | Latest stable. Strict typing serves the maintainability goal. |
| Output | `output: 'export'` → `out/`, dragged onto Netlify | It stays a static site, so no server is needed. |
| Styling | Keep `css/style.css` as `app/globals.css`, changing only asset URLs | The print layout depends on exact mm sizes and the existing selectors. |
| Fonts | Keep the existing `@font-face` rules, pointed at `/fonts/...`; no `next/font` | `next/font` generates hashed family names, and about 30 rules use literal names. |
| Images | Plain `<img src="/img/...">`, `images.unoptimized: true` | The card sizing is in mm and print-critical, and a static export has no image optimiser. |
| QR encoder | Port `js/qr.js` to `lib/qr.ts` as-is | It's proven and has no dependencies. Fixtures confirm the port matches. |
| Tests | Vitest | Fast, works with TypeScript as-is, no DOM needed for `lib/`. |
| Package manager | npm. Node 22 stays pinned in `.nvmrc` | Matches the current setup. |

## Project structure

```
app/
  layout.tsx          <html lang="en">, metadata (title "WiFi Cards", robots noindex/nofollow), imports globals.css
  page.tsx            server component; renders <WifiCardsApp/> (the only route)
  globals.css         css/style.css moved over; url('../assets/fonts/X') → url('/fonts/X')
components/
  WifiCardsApp.tsx    'use client'; owns the reducer, loads saved data, saves changes; renders masthead + .wrap
  UnitsTable.tsx      table.units + UnitRow
  Toolbar.tsx         Add unit, Paste CSV, Clear all, count, Print
  BulkImport.tsx      the .bulk panel
  Options.tsx         .opts
  Warnings.tsx        ul.warn-list
  Sheet.tsx           .sheet-scroll > .sheet > cards
  CardDesign1.tsx
  CardDesign2.tsx
  QrSvg.tsx
lib/
  types.ts            Unit, Auth ('WPA'|'WEP'|'nopass'), Design ('1'|'2'), Options, Plan, PlanItem, Warning
  qr.ts               encode, wifiPayload, toSvgPath, ECL
  csv.ts              countOutside, sniffDelim, parseDelimited, looksLikeHeader, normLabel, rowToUnit,
                      refKey, buildPlan, delimName, listAsCsv, EXAMPLE
  checks.ts           checkAll(units) → Warning[]
  units.ts            blank(), the reducer and its actions, hasContent(), activeUnits()
  storage.ts          loadState(), saveState(); converts between the saved shape and in-memory units with ids
  __fixtures__/qr.json
  *.test.ts
public/
  fonts/              moved from assets/fonts/
  img/                moved from assets/img/
next.config.ts        output: 'export', images: { unoptimized: true }
vitest.config.ts
eslint.config.mjs     Next config; @next/next/no-img-element off (with a comment saying why)
```

**npm scripts:** `dev`, `build`, `lint`, `test` (`vitest run`), `test:watch`.

**Removed when the migration is done:** `index.html`, `css/`, `js/`, `assets/`, `build.py` and `dist/`. `out/` and `.next/` are gitignored.

## State and data flow

### Types

```ts
type Auth = 'WPA' | 'WEP' | 'nopass';
type Design = '1' | '2';
interface Unit { id: string; ref: string; ssid: string; pass: string; auth: Auth; hidden: boolean }
interface Options { showRef: boolean; showPayload: boolean; design: Design }
```

`id` exists only in memory, taken from a module counter (`'u1'`, `'u2'`, …). `crypto.randomUUID()` isn't used because it only works in secure contexts. It gives React a stable key, so typing never loses focus.

### Reducer (`lib/units.ts`, pure)

State is `{ units: Unit[]; options: Options }`. Actions:

- `add`: appends `blank()`.
- `update(id, patch)`: merges the patch into one unit.
- `remove(id)`: removes the unit. If the list becomes empty, it becomes `[blank()]`.
- `clear`: sets the list to `[blank()]`. The component asks `confirm('Remove every unit from the list?')` first.
- `applyPlan(plan)`:
  - In replace mode the list becomes the plan's non-skipped units.
  - In append and merge mode, `update` items replace the unit at `at` and `add` items are appended. Afterwards, units with no content are dropped.
  - An empty result becomes `[blank()]`. Units coming from the plan get new ids.
- `setOptions(patch)`: merges into `options`.

"Has content" means `ref || ssid || pass`. "Active" means `ssid.trim() !== ''`.

### Saving and loading (`lib/storage.ts`)

- The saved shape stays `{ units: {ref, ssid, pass, auth, hidden}[], showRef, showPayload, design }`. `saveState` removes `id`, and `loadState` adds a new one to each unit.
- `loadState` matches the current behaviour:
  - Missing or unparseable data, or anything other than an array of units, gives an empty list, which becomes `[blank()]`.
  - Each option is used only if it has the right type. `design` must be `'1'` or `'2'`.
  - Defaults are `showRef: true`, `showPayload: false`, `design: '1'`.
- Every `localStorage` read and write is wrapped in try/catch. If storage fails (for example in private browsing), the page still works but doesn't remember anything.

### Loading after mount

The static export is pre-rendered at build time, when `localStorage` doesn't exist.

1. The reducer's lazy initializer returns `initialState()` on the server and `loadState()` in the browser.
2. A `useHydrated()` hook (`useSyncExternalStore` with server snapshot `false`, client snapshot `true`) returns `false` during the pre-render and the hydration pass, and `true` after that.
3. While `hydrated` is false, only the static parts render: the masthead, both `h2`s, `.lede` and `.preview-note`. `.editor` and `.sheet-scroll` render only once `hydrated` is true. Because nothing state-dependent renders during hydration, the server and client output can't disagree.
4. A save effect on `[hydrated, state]` calls `saveState(state)` **only when `hydrated` is true**. This guard stops a default state from ever being written over saved data.

### Bulk import

`BulkImport` keeps its own state: `open`, `text`, `mode` (`'replace' | 'append' | 'merge'`, default `replace`), and `result` (the message shown after Apply, or null).

- `plan = useMemo(() => buildPlan(text, mode, units), [text, mode, units])`. `buildPlan` returns `null` for blank text, as now. The preview table and Apply both use this one plan object.
- The status line follows today's rules exactly:
  - The CSS class is `ok`, `warn` or `err`.
  - The wording for replace mode depends on how many units have content now.
  - "That is just the header line…" covers an empty item list.
  - "Nothing usable found…" covers a plan with no usable rows.
  - The delimiter name and "header line skipped" are appended.
- Apply dispatches `applyPlan(plan)`, sets the result message (plus " Check the warnings under the table before printing."), and clears the preview. Apply is disabled when there are no usable rows.
- Insert an example sets `text = EXAMPLE`. Opening the panel or inserting the example focuses the textarea, using a ref.
- Copy the current list as CSV calls `navigator.clipboard.writeText(listAsCsv(units))`. The button shows "Copied" or "Copy failed" for 1600 ms. The hidden-textarea `execCommand` fallback is dropped, because the app is always served over http(s).

### Rendering

- `UnitRow` has controlled inputs, with the same placeholders and select options as today. The `<tr>` gets class `bad` when the unit has content but no network name.
- The toolbar count shows "N card"/"N cards" for active units, and nothing at zero.
- `Warnings` renders `checkAll(activeUnits(units))`, with `li.err` for errors.

## Cards and print

**The DOM structure is kept exactly.** The print CSS uses `>` selectors such as `.wrap>h2` and `.wrap>.lede`. The rendered tree must therefore match today's `index.html`: the same elements, class names, ids and nesting. Use fragments, never extra wrapper elements, inside `.wrap`, `.editor`, `.sheet` and `.card`.

- `Sheet` renders one card per active unit. Each card has class `card`, plus `cut-top` on every second card (odd index). With no active units it shows the existing empty-state card ("Add a unit with a network name to see its card here.").
- The card works as follows:
  - It builds the payload with `wifiPayload({ ssid, password: pass, auth, hidden })` and encodes it with `encode(payload, { ecl: 'Q' })`.
  - If encoding throws, it shows `<p class="c-empty">{message}</p>` where the QR would be.
  - The reference shows only when `showRef` is on and `ref` isn't empty.
  - The payload box (`.payload`) shows only when `showPayload` is on.
  - There's no password field when `auth === 'nopass'`.
- `CardDesign1` and `CardDesign2` copy the current markup exactly, including the class names and bilingual text, `.c-under` hanging under the QR in design 1, and `.c-bubble`/`.c-tail`/`.c-sky` in design 2. The logo is `/img/logo.png` with alt "Lisbeyond", and the skyline is `/img/skyline.png`.
- `QrSvg({ qr, darkMm })`:
  - `darkMm` is 58 for design 1 and 40 for design 2.
  - It computes `p = toSvgPath(qr, 4)`, `box = darkMm * p.dim / qr.size` and `bleed = darkMm * 4 / qr.size`, both with `toFixed(2)`.
  - It renders `<svg class="c-qr" viewBox="0 0 dim dim" style={{width, height, margin: -bleed}} shapeRendering="crispEdges"><rect width height/><path d/></svg>`.
  - The current comment explaining the quiet-zone pull-back moves with it.
- No `dangerouslySetInnerHTML` anywhere. React's own escaping replaces `esc()`.
- `globals.css` keeps the `@media print` block, `@page { size: A4 portrait; margin: 0 }` and `print-color-adjust: exact` unchanged.

## Error handling

The app handles errors exactly as it does today, with no new error UI:
- Storage errors fall back silently.
- QR encoding errors show inside the card and as an error warning.
- Clipboard errors show "Copy failed" on the button.

## Testing

### Unit tests (Vitest, committed)

- **`qr.test.ts`**
  - Before `js/qr.js` is deleted, a one-off script runs it over a fixed set of payloads and writes `lib/__fixtures__/qr.json`, storing for each payload `{ payload, ecl, version, size, rows }`, where `rows` are strings of `0`/`1`. The set covers:
    - an empty network name
    - a minimal network
    - every escaped character (`\ ; , : "`)
    - accented text
    - `nopass`, `WEP`, and hidden networks
    - payloads long enough to reach version 10 or above
    - all four error-correction levels
  - The test checks `lib/qr.ts` produces the same grid for every case.
  - It also checks `wifiPayload` output and escaping directly, and checks `toSvgPath`'s `dim`.
- **`csv.test.ts`**
  - Delimiter detection, including that tab beats semicolon beats comma when counts tie, and that delimiters inside quotes are ignored.
  - RFC 4180: doubled `""` and delimiters inside quoted fields; blanks before an opening quote and after a closing quote.
  - The BOM and CRLF line endings, and blank lines being dropped.
  - Quoted fields kept exactly while unquoted fields are trimmed.
  - Header detection:
    - English and Portuguese headings, accented or not
    - `Alfama T2, Lisbeyond_Wifi, senha2026` is **not** a header
    - a lone header line gives an empty item list
  - Columns 4 and 5: open, WEP and hidden values.
  - All three modes. Merge matches only rows that already existed, ignoring case and extra whitespace.
  - Skip notes for one-column rows and rows with no network name.
  - Item notes for no password, a WPA password under 8 characters, a repeated reference, and extra columns.
  - `listAsCsv` quoting, and that its output reads back through `buildPlan` to the same units.
- **`checks.test.ts`:** one case per warning:
  - no password
  - a WPA password under 8 characters
  - leading or trailing spaces
  - a duplicate network and password
  - a QR at version 10 or above
  - non-ASCII characters
  - an encoding error
- **`units.test.ts`:**
  - the reducer actions and their blank-row rules
  - `applyPlan` in each mode
  - `storage` save and load: ids removed on save, added back on load, invalid options ignored, bad JSON handled

### Checking the pages match (one-off during the migration, not committed)

- Serve the current `dist/index.html` and the new `out/` locally, and seed the same `localStorage` into both.
- Use headless Chrome through Playwright (run with `npx`, not added to `package.json`) to capture PDFs and screenshots for:
  - design 1 and design 2
  - the reference shown and hidden
  - the payload shown and hidden
- Compare the pages pixel by pixel, and check every PDF page is A4 with no blank trailing page.
- Report the results to the user before the old files are deleted.

### Manual check (user)

Print one sheet of each design, and scan the QR codes with an iPhone and an Android phone.

## Rollout

1. Do all work on `nextjs-migration`.
2. Build the Next.js app next to the existing files. The old files remain the reference until the pages are confirmed to match.
3. Generate the QR fixtures from `js/qr.js` before removing it.
4. When the pages match, delete the old files, then update `CLAUDE.md` and `README.md`:
   - commands: `npm run dev/build/lint/test`
   - structure
   - deploy by dragging `out/` onto Netlify
   - preview the build with `npx serve out`
   - double-clicking `out/index.html` no longer works, because assets load from `/_next/...`
   - the font licence note is kept
5. Saved data carries over with no conversion.
