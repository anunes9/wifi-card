---
name: wifi-cards
description: Generates Lisbeyond's printable WiFi cards (A5 landscape, two per A4 sheet, each with a QR code that joins the network) from a CSV or spreadsheet of apartments, networks and passwords. Use whenever someone sends a CSV, TSV or pasted table of units with WiFi network names and passwords, or asks for WiFi cards, WiFi QR cards or guest WiFi signs to print.
---

# WiFi cards

Turns a list of apartments into a print-ready PDF (and a matching HTML page) of
Lisbeyond WiFi cards. The script is the same code as the WiFi Cards web app, so
the cards, the QR codes and the warnings match it exactly. Do not draw the cards
yourself or edit the generated HTML: run the script.

## Input

One row per apartment. Columns, in this order:

1. Unit reference (e.g. `Alfama T2`), printed small on the card
2. Network name (SSID), required
3. Password
4. Security, optional: `WPA` (the default), `WEP`, or `open`/`nopass`
5. Hidden network, optional: `yes` if the SSID is hidden

A header row is detected and skipped automatically, and the separator (tab,
semicolon or comma) is sniffed, so a CSV exported from Excel on a Portuguese
machine works as is. Quote a field that contains the separator.

If the user pastes the table into the chat instead of attaching a file, write it
to a `.csv` file exactly as given, keeping every character of each password.
If they send an `.xlsx`, export the sheet to CSV first, keeping passwords as
text (no number formatting, no trimmed leading zeros).

## Run

```sh
node <skill-dir>/scripts/wificards.mjs <input.csv> [--design 1|2] [--no-ref] [--out <file.html>] [--pdf <file.pdf>]
```

- `--design 1` is the cream, plain card (the default); `--design 2` is the navy
  speech-bubble card with the Lisbon skyline and the contacts. If the user has
  not said which, use design 1 and mention that design 2 exists.
- `--no-ref` leaves the unit reference off the cards.
- Outputs default to `<input>-wifi-cards.html` and `.pdf` next to the CSV. Write
  them where the user can download them (for example the outputs directory).

It needs only Node 18 or later; there is nothing to install. The PDF is printed
with a local Chromium or Chrome if one is found; if none is, `pdf` is `null`, `pdfError`
says why, and the HTML is the deliverable instead.

## Read the report

The script prints JSON on stdout and exits 1 when no cards could be made.

- `cards`, `sheets`: how many cards and A4 sheets were produced.
- `skipped`: CSV lines that made no card (no network name, or the separator was
  wrong). Tell the user each line and why.
- `warnings`: entries with `"err": true` are cards that will not work, such as a
  WPA password under 8 characters or a leading or trailing space. List them
  plainly and ask whether to fix and regenerate. The others are advice (a dense
  QR, accented characters, two units with the same credentials).
- `notes`: per-line notes from the import, such as a repeated unit reference.

Then send the PDF (or the HTML) and remind the user how to print it:

> Print at 100% scale (not "fit to page") on A4. For the HTML, set margins to
> **None** and turn **Background graphics** on. Cut along the dashed line.

## Don't

- Don't "tidy" passwords: no trimming inside quotes, no case changes, no
  replacing look-alike characters. The QR encodes them exactly.
- Don't put passwords in anything other than the files the user asked for.
