/* The command the skill runs. Bundled with React into one ESM file, so it needs
   only Node: no npm install inside the sandbox it lands in.

     node wificards.mjs <cards.csv> [--design 1|2] [--no-ref] [--out cards.html] [--pdf cards.pdf]

   Prints a JSON report on stdout; the HTML (and the PDF, when a Chromium can
   be found) are written next to the CSV unless --out/--pdf say otherwise. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderCards } from './render';
import type { Design } from '../lib/types';

const MIME: Record<string, string> = {
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png',
};

function usage(msg?: string): never {
  if (msg) process.stderr.write(msg + '\n');
  process.stderr.write('usage: node wificards.mjs <cards.csv> [--design 1|2] [--no-ref] [--out cards.html] [--pdf cards.pdf] [--no-pdf]\n');
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const a = { csv: '', design: '1' as Design, showRef: true, out: '', pdf: '', noPdf: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => argv[++i] ?? usage(k + ' needs a value');
    if (k === '--design') {
      const d = val();
      if (d !== '1' && d !== '2') usage('--design is 1 (cream) or 2 (navy)');
      a.design = d;
    } else if (k === '--no-ref') a.showRef = false;
    else if (k === '--out') a.out = val();
    else if (k === '--pdf') a.pdf = val();
    else if (k === '--no-pdf') a.noPdf = true;
    else if (k.startsWith('--')) usage('unknown option ' + k);
    else if (!a.csv) a.csv = k;
    else usage('one CSV at a time');
  }
  if (!a.csv) usage();
  return a;
}

// assets/ sits next to scripts/ in the packaged skill.
function loadAssets(root: string): { css: string; assets: Record<string, string> } {
  const assets: Record<string, string> = {};
  for (const sub of ['fonts', 'img']) {
    for (const f of readdirSync(join(root, sub))) {
      const type = MIME[extname(f).toLowerCase()];
      if (type) assets['/' + sub + '/' + f] = 'data:' + type + ';base64,' + readFileSync(join(root, sub, f)).toString('base64');
    }
  }
  return { css: readFileSync(join(root, 'cards.css'), 'utf8'), assets };
}

function findChromium(): string {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome']) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (p) return p;
    } catch { /* not on PATH */ }
  }
  // Playwright's downloaded browsers, wherever this machine keeps them.
  const caches = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(homedir(), '.cache/ms-playwright')];
  for (const dir of caches) {
    if (!dir || !existsSync(dir)) continue;
    for (const b of readdirSync(dir).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const exe of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        if (existsSync(join(dir, b, exe))) return join(dir, b, exe);
      }
    }
  }
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return existsSync(mac) ? mac : '';
}

function printPdf(chrome: string, html: string, pdf: string): void {
  execFileSync(chrome, [
    '--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
    '--user-data-dir=' + join(tmpdir(), 'wificards-chrome'),
    '--print-to-pdf=' + pdf, pathToFileURL(html).href,
  ], { stdio: 'ignore', timeout: 120000 });
}

const args = parseArgs(process.argv.slice(2));
const csvPath = resolve(args.csv);
const stem = join(dirname(csvPath), basename(csvPath, extname(csvPath)) + '-wifi-cards');
const htmlPath = resolve(args.out || stem + '.html');
const pdfPath = args.noPdf ? '' : resolve(args.pdf || htmlPath.replace(/\.html?$/i, '') + '.pdf');

const { css, assets } = loadAssets(join(dirname(fileURLToPath(import.meta.url)), '..', 'assets'));
const { html, report } = renderCards(readFileSync(csvPath, 'utf8'), css, assets, {
  design: args.design, showRef: args.showRef,
});
writeFileSync(htmlPath, html);

let pdf: string | null = null;
let pdfError: string | null = null;
if (pdfPath && report.cards) {
  const chrome = findChromium();
  if (!chrome) pdfError = 'no Chromium or Chrome found; print the HTML from a browser instead';
  else {
    try {
      printPdf(chrome, htmlPath, pdfPath);
      pdf = pdfPath;
    } catch (e) {
      pdfError = e instanceof Error ? e.message : String(e);
    }
  }
}

process.stdout.write(JSON.stringify({ html: htmlPath, pdf, pdfError, design: args.design, ...report }, null, 2) + '\n');
process.exit(report.cards ? 0 : 1);
