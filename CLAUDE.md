# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A WiFi card generator for Lisbeyond Ops, built as a static Next.js app. It prints one A5 landscape card per apartment, two per A4 portrait sheet, each with a QR code that joins the network. Everything runs in the browser: `output: 'export'`, no server code, no API routes, no network calls at run time. State lives in `localStorage` under `lisbeyond.wificards.v1`, in the same shape the pre-Next version wrote, so old saves still load.

## Commands

```sh
npm run dev                          # http://localhost:3000
npm run build                        # static export to out/ (the deploy artifact; drag onto Netlify)
npm run lint
npm test                             # Vitest over lib/ and skill/
npm run skill                        # bundle the Claude skill to dist/ (and dist/wifi-cards.zip)
npx vitest run lib/csv.test.ts       # one file
npx vitest run -t "merges by reference"   # one test by name
npx tsc --noEmit
```

Node is pinned in `.nvmrc`. Preview a build with `npx serve out`. Opening `out/index.html` from disk does not work.

## Architecture

- **`lib/`** holds all the logic, with no React or DOM inside. Files import each other with relative paths so Vitest needs no alias config.
  - `qr.ts`: a self-contained QR encoder, plus `wifiPayload` (escapes `\ ; , : "`) and `toSvgPath`. `__fixtures__/qr.json` pins its output to the original encoder. Never regenerate the fixtures to make a test pass.
  - `csv.ts`: the bulk import. It detects the delimiter (tab, then semicolon, then comma), parses RFC 4180 quoting (quoted fields kept exactly, unquoted ones trimmed), detects headers strictly per column, and builds an import plan for the replace, append or merge-by-reference modes. The preview and Apply both use the one `buildPlan` result.
  - `checks.ts`: the warnings for cards that won't work.
  - `units.ts`: the reducer and unit helpers. The in-memory `id` is a React key only.
  - `storage.ts`: loads and saves state. It removes `id`s on save and rebuilds units field by field on load.
- **`components/`** are client components under `WifiCardsApp`, which owns the `useReducer` state. Loading saved data works like this:
  - The reducer's lazy initializer loads from `localStorage` in the browser.
  - `useHydrated()` keeps the editor and the card sheet unrendered until hydration finishes, so the pre-rendered HTML and the client agree.
  - Saving is gated on that same flag, so a default state is never written over a saved list.
- **Cards:** `Sheet` encodes each active unit at ECC level **Q** and renders `CardDesign1` (cream) or `CardDesign2` (navy speech bubble). `QrSvg` sizes the printed dark square: 58 mm for design 1, 40 mm for design 2. It then pulls the quiet zone back with a negative margin.

### The Claude skill

`skill/` packages the same cards as a Claude skill, so someone can send Claude a CSV and get a printable PDF back. `skill/render.tsx` runs `buildPlan` (replace mode), `checkAll` and `Sheet` through `renderToStaticMarkup`, and inlines `app/globals.css`, the fonts and the images as data URIs. `skill/cli.ts` reads the CSV, writes the HTML, prints a PDF with headless Chromium when it finds one, and prints a JSON report. `scripts/build-skill.mjs` bundles the CLI with React (rolldown, already a dependency via Vitest) into `dist/skill/wifi-cards/scripts/wificards.mjs`, so the skill needs only Node, then copies `SKILL.md`, the CSS, the fonts and the images, and zips it. `dist/` is not committed. Any change to the cards, the CSS or the fonts needs a rebuild and re-upload of the zip.

### The DOM is part of the print contract

`app/globals.css` is the original stylesheet, unchanged. Its print rules use child selectors such as `.wrap>h2`, and the card layout is in mm. Components therefore output a fixed tree of elements and class names. Don't add wrapper elements inside `.wrap`, `.editor`, `.sheet` or `.card`; use fragments. Keep user-visible text on one JSX line, or use `{' '}`, because JSX drops whitespace that contains a line break. Images are plain `<img>` and fonts are plain `@font-face` (no `next/image` or `next/font`), for the same reason.

## Printing

When printing, set margins to **None** and turn **Background graphics** on.

## Licensing

Barlow, Barlow Condensed and Lexend are OFL. **Kento** and **LE Amalfi** are not confirmed to be open-licensed, so check the client holds a licence before redistributing them.
