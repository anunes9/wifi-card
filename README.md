# WiFi Cards — Lisbeyond Ops

Prints one WiFi card per apartment (A5 landscape, two per A4 sheet) with a QR code
that joins the network. Runs entirely in the browser: no backend, no network calls,
no dependencies. Data is kept in `localStorage` (key `lisbeyond.wificards.v1`).

## Structure
    index.html        markup (dev version — loads the files below)
    css/style.css     all styles, incl. print layout and @font-face
    js/qr.js          self-contained QR encoder (byte mode, v1–40, ECC L/M/Q/H) + WIFI: payload
    js/app.js         editor, cards, guardrails, bulk CSV import
    assets/fonts/     Barlow, Barlow Condensed, Lexend, Kento, Amalfi
    assets/img/       logo.png, skyline.png
    build.py          inlines everything into dist/index.html (single deployable file)
    dist/index.html   built output — this is what to upload to Netlify

## Develop
Open `index.html` directly, or serve the folder (`python3 -m http.server`).

## Build & deploy
    python3 build.py        # -> dist/index.html
Drag the `dist/` folder onto Netlify (or any static host).

## Key details
- QR payload: `WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<pass>;H:true;;` with `\ ; , : "` escaped. ECC level Q.
- Print: `@page { size: A4 portrait; margin: 0 }`; in the print dialog set margins to
  None and enable Background graphics.
- Brand tokens (CSS variables in `:root`): navy #13203C, red #C94030, cream #FAF0E4;
  design 2 uses #111A45 / #FDF1E4 / #E5422F.

## Licences — check before redistributing
Barlow, Barlow Condensed and Lexend are OFL. **Kento** and **LE Amalfi** are not
confirmed open-licensed: make sure the client holds a licence for them.
