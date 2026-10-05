/* The skill's renderer: CSV text in, one self-contained printable HTML page out.
   It reuses the app's own import plan, checks and card components, so a card
   printed from the skill is the same card the app prints. Fonts and images are
   passed in as data URIs and inlined, because the page has to open from disk
   or as an attachment, with no server behind it. */
import { renderToStaticMarkup } from 'react-dom/server';
import Sheet from '../components/Sheet';
import { buildPlan, delimName } from '../lib/csv';
import { checkAll } from '../lib/checks';
import { activeUnits, DEFAULT_OPTIONS, withId } from '../lib/units';
import type { Options, Warning } from '../lib/types';

export interface SkippedLine {
  line: number;
  why: string;
}

export interface Report {
  cards: number;
  sheets: number;
  delimiter: string;
  header: boolean;
  skipped: SkippedLine[];
  notes: SkippedLine[];
  warnings: Warning[];
}

/* `assets` maps each public path the stylesheet and cards use
   ("/fonts/Lexend-400.ttf", "/img/logo.png") to its data URI. */
export function renderCards(
  csv: string,
  css: string,
  assets: Record<string, string>,
  options: Partial<Options> = {},
): { html: string; report: Report } {
  const opts: Options = { ...DEFAULT_OPTIONS, ...options, showPayload: false };
  const plan = buildPlan(csv, 'replace', []);
  const items = plan ? plan.items : [];
  const units = activeUnits(items.filter((it) => it.action !== 'skip').map((it) => withId(it.u)));

  const report: Report = {
    cards: units.length,
    sheets: Math.ceil(units.length / 2),
    delimiter: plan ? delimName(plan.delim) : 'commas',
    header: plan ? plan.header : false,
    skipped: items.filter((it) => it.action === 'skip').map((it) => ({ line: it.line, why: it.notes.join('; ') })),
    notes: items.filter((it) => it.action !== 'skip' && it.notes.length).map((it) => ({ line: it.line, why: it.notes.join('; ') })),
    warnings: checkAll(units),
  };

  const inline = (s: string) =>
    s.replace(/(["'(])(\/(?:fonts|img)\/[^"')]+)(["')])/g, (m, a: string, p: string, b: string) =>
      assets[p] ? a + assets[p] + b : m);

  const sheet = renderToStaticMarkup(<Sheet units={units} options={opts} />);
  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>WiFi Cards</title>',
    '<style>' + inline(css) + '</style>',
    '</head><body>',
    '<p class="noprint preview-note" style="margin:16px">' + report.cards + ' card' + (report.cards === 1 ? '' : 's') +
      ' on ' + report.sheets + ' A4 sheet' + (report.sheets === 1 ? '' : 's') +
      '. Print with margins set to None and Background graphics turned on.</p>',
    inline(sheet),
    '</body></html>',
  ].join('\n');

  return { html, report };
}
