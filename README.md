# WiFi Cards — Lisbeyond Ops

Prints one WiFi card per apartment (A5 landscape, two per A4 sheet) with a QR code
that joins the network. Runs entirely in the browser: no backend, no network calls
at run time. Data is kept in `localStorage` (key `lisbeyond.wificards.v1`).

Built with Next.js as a static export.

## Structure
    app/              layout, the single page, globals.css (all styles, incl. print layout and @font-face)
    components/       React UI: units table, toolbar, bulk CSV import, options, warnings, card sheet
    skill/            the Claude skill: SKILL.md, the CLI and its HTML renderer
    scripts/          build-skill.mjs, which bundles and zips the skill
    lib/              pure logic with tests: QR encoder, WIFI: payload, CSV import, checks, state, storage
    public/fonts/     Barlow, Barlow Condensed, Lexend, Kento, Amalfi
    public/img/       logo.png, skyline.png

## Develop
    npm install
    npm run dev           # http://localhost:3000
    npm test              # Vitest, lib/ only
    npm run lint

## Build & deploy
    npm run build         # -> out/
Drag the `out/` folder onto Netlify (or any static host). To preview the build
locally, run `npx serve out`. Opening `out/index.html` straight from disk does not
work, because its scripts and styles load from `/_next/...`.

## Claude skill
The same cards can be made by Claude from a CSV. `skill/` holds the skill: a CLI
(`skill/cli.ts`) that runs the app's own CSV import, checks and card components
through `react-dom/server`, and writes a self-contained HTML page plus a PDF
(printed with headless Chromium when one is available).

    npm run skill         # -> dist/skill/wifi-cards/ and dist/wifi-cards.zip

Upload `dist/wifi-cards.zip` in Claude under Settings → Capabilities → Skills, then
send Claude a CSV and ask for WiFi cards. For Claude Code, copy
`dist/skill/wifi-cards/` into `~/.claude/skills/` (or a project's `.claude/skills/`).
Rebuild and re-upload after changing the cards, the CSS or the fonts.

To run it without Claude:

    node dist/skill/wifi-cards/scripts/wificards.mjs units.csv --design 2

## Key details
- QR payload: `WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<pass>;H:true;;` with `\ ; , : "` escaped. ECC level Q.
- Print: `@page { size: A4 portrait; margin: 0 }`; in the print dialog set margins to
  None and enable Background graphics.
- Brand tokens (CSS variables in `:root`): navy #13203C, red #C94030, cream #FAF0E4;
  design 2 uses #111A45 / #FDF1E4 / #E5422F.

## Licences — check before redistributing
Barlow, Barlow Condensed and Lexend are OFL. **Kento** and **LE Amalfi** are not
confirmed open-licensed: make sure the client holds a licence for them.
