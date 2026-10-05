/* Bulk CSV import. The team keeps its networks in a spreadsheet, so pasting
   beats typing. The rules here are chosen for what actually lands in the box:
     - Excel on a Portuguese machine exports semicolons, not commas.
     - Copying cells out of a sheet gives tabs.
     - So the delimiter is sniffed rather than assumed.
   Quoting is RFC 4180 (doubled "" inside a quoted field), which matters because
   a password may legitimately contain the delimiter. Unquoted fields are
   trimmed — stray spaces there are always artefacts of the copy — while quoted
   fields are kept byte for byte, since quoting is how a sheet says "I meant
   this exactly". */
import type { Auth, BulkMode, Plan, PlanItem, UnitData } from './types';

export interface Field {
  v: string;
  q: boolean;
}

export const EXAMPLE = [
  'Unit,Network,Password',
  'Alfama T2,Lisbeyond_Alfama,Bemvindo2026',
  'Graça T1,Lisbeyond_Graca,OlaLisboa25',
  'Príncipe Real T3,Lisbeyond_PRoyal,BoaEstadia!24',
].join('\n');

export function countOutside(text: string, ch: string): number {
  let n = 0, inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === '"') inQ = !inQ;
    else if (!inQ && c === ch) n++;
  }
  return n;
}

// Tab first, then semicolon, then comma: a tab or a semicolon in the paste is a
// deliberate separator, whereas a comma is just as likely to sit in a password.
export function sniffDelim(text: string): string {
  let best = ',', bestN = 0;
  for (const d of ['\t', ';', ',']) {
    const n = countOutside(text, d);
    if (n > bestN) { bestN = n; best = d; }
  }
  return best;
}

export function parseDelimited(text: string, delim: string): Field[][] {
  const rows: Field[][] = [];
  let row: Field[] = [], field = '', quoted = false, inQ = false, closed = false;
  text = text.replace(/^﻿/, ''); // Excel's UTF-8 BOM
  const endField = () => {
    row.push({ v: field, q: quoted });
    field = ''; quoted = false; closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (inQ) {
      if (c !== '"') field += c;
      else if (text.charAt(i + 1) === '"') { field += '"'; i++; } // "" is one "
      else { inQ = false; closed = true; }
    }
    // Strict RFC 4180 wants the quote flush against the delimiter, but both
    // Excel and Sheets happily emit `, "value"` — so allow leading blanks
    // before the quote, and drop the blanks that follow the closing one.
    else if (c === '"' && !quoted && !/\S/.test(field)) { inQ = true; quoted = true; field = ''; }
    else if (c === delim) endField();
    else if (c === '\n') { endField(); rows.push(row); row = []; }
    else if (c === '\r') { /* CRLF — the \n does the work */ }
    else if (!(closed && !/\S/.test(c))) field += c;
  }
  endField();
  rows.push(row);
  return rows.filter((r) => r.some((f) => f.v.trim() !== ''));
}

function cell(f: Field | undefined): string {
  return f ? (f.q ? f.v : f.v.trim()) : '';
}

/* Header detection is deliberately strict, and per column. A loose "does the
   line mention wifi or senha anywhere" test throws away a real first row like
   `Alfama T2, Lisbeyond_Wifi, senha2026` — so a cell counts only if the WHOLE
   cell is a label for THAT column, and a cell containing a digit is never a
   label (SSIDs and passwords have digits; column headings do not). */
const HEADINGS = [
  /^(unit|unit ref\w*|ref\w*|apartment|flat|name|id|unidade|apartamento|imovel|propriedade|fracao|fraccao|casa|nome)$/,
  /^(network|network name|ssid|wifi|wifi name|wifi network|rede|nome da rede|rede wifi)$/,
  /^(password|pass|pwd|passphrase|passcode|key|wifi password|senha|palavra passe|palavra chave|codigo)$/,
];

// Folds the accents so the Portuguese headings need only one spelling above.
export function normLabel(s: string): string {
  return String(s).toLowerCase()
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
    .replace(/[^a-z]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function looksLikeHeader(r: Field[]): boolean {
  let hits = 0;
  for (let i = 0; i < 3; i++) {
    const raw = r[i] ? r[i].v.trim() : '';
    if (!raw || /\d/.test(raw)) continue;
    if (HEADINGS[i].test(normLabel(raw))) hits++;
  }
  return hits >= 2;
}

// Columns 4 and 5 are optional and rarely used, but honouring them costs
// nothing and saves a hand-edit when a unit really is WEP or hidden.
export function rowToUnit(r: Field[]): UnitData {
  const extra = (r[3] ? r[3].v : '').trim().toLowerCase();
  let auth: Auth = 'WPA';
  if (/^(nopass|open|none|aberta?|aberto|sem)/.test(extra)) auth = 'nopass';
  else if (/^wep/.test(extra)) auth = 'WEP';
  const h = (r[4] ? r[4].v : '').trim().toLowerCase();
  return {
    ref: cell(r[0]), ssid: cell(r[1]), pass: cell(r[2]), auth,
    hidden: /^(1|y|yes|true|sim|hidden|ocult[ao])$/.test(h),
  };
}

export function refKey(s: string | undefined): string {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* What Apply would do. The preview and Apply both read this one result, so
   they can never disagree about the outcome. */
export function buildPlan(text: string, mode: BulkMode, units: UnitData[]): Plan | null {
  if (!text.trim()) return null;

  const delim = sniffDelim(text);
  let rows = parseDelimited(text, delim);
  // No row-count guard here: a paste of the header alone should come out empty
  // rather than turn the word "Network" into a card.
  const header = rows.length > 0 && looksLikeHeader(rows[0]);
  if (header) rows = rows.slice(1);

  // In merge mode a reference can only match a unit that was already there, so
  // the index is built once, before anything is appended.
  const index: Record<string, number> = {};
  if (mode === 'merge') {
    units.forEach((u, i) => {
      const k = refKey(u.ref);
      if (k && !(k in index)) index[k] = i;
    });
  }

  const items: PlanItem[] = [];
  const seenRef: Record<string, number> = {};
  let added = 0, updated = 0, skipped = 0;
  rows.forEach((r, i) => {
    const u = rowToUnit(r);
    const it: PlanItem = { line: i + 1 + (header ? 1 : 0), u, notes: [], action: 'add' };

    if (!u.ssid) {
      it.action = 'skip';
      it.notes.push(r.length < 2 ? 'only one column on this line — check the separator' : 'no network name');
      skipped++;
    } else {
      const k = refKey(u.ref);
      if (mode === 'merge' && k && k in index) { it.action = 'update'; it.at = index[k]; updated++; }
      else added++;

      if (u.auth !== 'nopass' && !u.pass) it.notes.push('no password');
      else if (u.auth === 'WPA' && u.pass.length < 8) it.notes.push('WPA password under 8 characters');
      if (k && seenRef[k]) it.notes.push('reference repeats line ' + seenRef[k]);
      else if (k) seenRef[k] = it.line;
      if (r.length > 5) it.notes.push('extra columns after column 5 ignored');
    }
    items.push(it);
  });

  return { mode, delim, header, items, added, updated, skipped };
}

export function delimName(d: string): 'tabs' | 'semicolons' | 'commas' {
  return d === '\t' ? 'tabs' : d === ';' ? 'semicolons' : 'commas';
}

/* The status line shown after Apply. */
export function applyMessage(plan: Plan): string {
  const fresh = plan.added + plan.updated;
  let msg = plan.mode === 'replace'
    ? 'Replaced the list with ' + fresh + ' unit' + (fresh === 1 ? '' : 's') + '.'
    : (plan.updated ? 'Updated ' + plan.updated + ', ' : '') + 'added ' + plan.added + '.';
  if (plan.skipped) {
    msg += ' ' + plan.skipped + ' line' + (plan.skipped === 1 ? '' : 's') + ' skipped for having no network name.';
  }
  return msg + ' Check the warnings under the table before printing.';
}

// Leading or trailing spaces are quoted too: unquoted fields are trimmed on
// the way back in, which would silently change the password.
export function csvField(s: string): string {
  s = String(s ?? '');
  return /[",;\t\n\r]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function listAsCsv(units: UnitData[]): string {
  const lines = ['Unit reference,Network name,Password,Security,Hidden'];
  for (const u of units) {
    if (!(u.ref || u.ssid || u.pass)) continue;
    lines.push([u.ref, u.ssid, u.pass, u.auth, u.hidden ? 'yes' : ''].map(csvField).join(','));
  }
  return lines.join('\n');
}
