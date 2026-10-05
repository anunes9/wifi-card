# Next.js Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written static WiFi card generator with a Next.js 16 static export that looks, behaves and prints exactly the same.

**Architecture:** Pure TypeScript modules in `lib/` hold all the logic (QR encoder, CSV import, checks, reducer, storage) and get Vitest tests. Small client components in `components/` render the same DOM as today's `index.html`, so `css/style.css` can move over unchanged as `app/globals.css`. `next build` with `output: 'export'` writes a static `out/` folder. A one-off Playwright script compares old and new pixel by pixel.

**Tech Stack:** Next.js 16.3.8 (App Router), React 19.3, TypeScript ~6.0.3 (typescript-eslint supports `<6.1`), ESLint 9 with eslint-config-next 16.3.8, Vitest 5, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-04-nextjs-migration-design.md`

## Global Constraints

- Work on the `nextjs-migration` branch. Commit after every task.
- `localStorage` key `lisbeyond.wificards.v1`. Saved shape: `{ units: {ref, ssid, pass, auth, hidden}[], showRef, showPayload, design }`, with keys in that order.
- No network calls at run time, no server code, no API routes.
- Do not change any CSS rule. `app/globals.css` is `css/style.css` with only the font URLs rewritten.
- Components must output the same elements, class names, ids and nesting as today's `index.html` and `js/app.js`. Inside `.wrap`, `.editor`, `.sheet` and `.card`, use fragments, never extra wrapper elements.
- No `dangerouslySetInnerHTML`.
- QR codes are always encoded at ECC level `Q`. The printed dark square is 58 mm for design 1 and 40 mm for design 2.
- Images are plain `<img>` tags pointing at `/img/...`. Fonts come from the existing `@font-face` rules pointing at `/fonts/...`. No `next/font`, no `next/image`.
- `lib/` files import each other with relative paths (`./types`) so Vitest needs no alias config. Components import with `@/lib/...`.
- Write user-visible text as single JSX lines. If a line must break, put `{' '}` where the space belongs, because JSX drops whitespace that contains a line break.
- Keep the legacy files (`index.html`, `css/`, `js/`, `assets/`, `build.py`, `dist/`) until Task 9.

## Review Focus

1. **Corrupt or old saved data.** Units missing fields, `null` entries, a non-array `units`, or a bad `auth` must load as clean units, never crash. *(Task 5: `storage.test.ts` "sanitises units")*
2. **First load with a saved list.** The saved list must not be overwritten by the default blank state during pre-render or hydration. *(Task 6: harness `screen` scope checks that storage is unchanged after load)*
3. **Typing in a row.** It must keep focus and leave the other rows untouched. This depends on `update` keeping ids and object identity. *(Task 5: `units.test.ts` "update keeps ids and untouched units")*
4. **Applying the same paste twice.** After Apply, the button must stay disabled until the text, mode or panel state changes. *(Task 8: harness `bulk` scope asserts `#bulk-apply` is disabled after applying)*
5. **A network name of only spaces.** That unit must produce no card, its row must be flagged, and it must not be counted. *(Task 5: `units.test.ts` "whitespace-only network names")*

---

### Task 1: Set up Next.js alongside the legacy files

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `public/fonts/*`, `public/img/*`

**Interfaces:**
- Produces: the `@/*` path alias pointing at the repo root; `npm run dev|build|lint|test|test:watch`; `app/globals.css` with every font loaded from `/fonts/<file>`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "wifi-cards",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install next@16.3.8 react@19.3.0 react-dom@19.3.0
npm install -D typescript@~6.0.3 @types/react@^19 @types/react-dom@^19 @types/node@^22 eslint@^9 eslint-config-next@16.3.8 vitest@^5
```
Expected: both finish without `ERESOLVE` errors, and `package-lock.json` is created.

- [ ] **Step 3: Write the config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules", "out"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
```

`eslint.config.mjs`:
```js
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Card images are sized in mm for print, and a static export has no image
      // optimiser, so next/image buys nothing here.
      '@next/next/no-img-element': 'off',
    },
  },
  // js/ and dist/ are the legacy app, kept as the reference until the migration ends.
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts', 'js/**', 'dist/**']),
]);
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['lib/**/*.test.ts'], environment: 'node' },
});
```

`.gitignore`:
```
node_modules/
.next/
out/
next-env.d.ts
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 4: Copy the assets and create `globals.css`**

Run:
```bash
mkdir -p public app
cp -R assets/fonts public/fonts
cp -R assets/img public/img
sed "s#url('../assets/fonts/#url('/fonts/#g" css/style.css > app/globals.css
grep -c "url('/fonts/" app/globals.css
grep -c "assets/" app/globals.css
```
Expected: `14`, then `0`. The second grep exits with status 1 because it matches nothing, which is fine.

- [ ] **Step 5: Write the layout and a placeholder page**

`app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'WiFi Cards',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx` (this placeholder is replaced in Task 6):
```tsx
export default function Page() {
  return (
    <div className="wrap">
      <h2>The units</h2>
    </div>
  );
}
```

- [ ] **Step 6: Build, lint and type-check**

Run:
```bash
npm run build && ls out/index.html out/fonts/Kento-400.ttf out/img/logo.png && grep -rl "/fonts/Kento-400.ttf" out/_next/static | head -1
npm run lint
npx tsc --noEmit
```
Expected:
- The build ends with the route `/` listed as static (○).
- All three `ls` paths exist.
- The grep prints one CSS file path.
- Lint and tsc print no errors.

`next build` may rewrite `tsconfig.json` and create `next-env.d.ts`. Keep the `tsconfig.json` changes. `next-env.d.ts` is gitignored.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs vitest.config.ts .gitignore app public
git commit -m "chore: set up Next.js 16 static export alongside the legacy app"
```

---

### Task 2: Types and the QR encoder port

**Files:**
- Create: `lib/types.ts`, `lib/qr.ts`, `lib/qr.test.ts`, `lib/__fixtures__/qr.json`

**Interfaces:**
- Produces (`lib/types.ts`):
  ```ts
  type Auth = 'WPA' | 'WEP' | 'nopass'
  type Design = '1' | '2'
  type BulkMode = 'replace' | 'append' | 'merge'
  interface UnitData { ref: string; ssid: string; pass: string; auth: Auth; hidden: boolean }
  interface Unit extends UnitData { id: string }
  interface Options { showRef: boolean; showPayload: boolean; design: Design }
  interface AppState { units: Unit[]; options: Options }
  interface PlanItem { line: number; u: UnitData; notes: string[]; action: 'add' | 'update' | 'skip'; at?: number }
  interface Plan { mode: BulkMode; delim: string; header: boolean; items: PlanItem[]; added: number; updated: number; skipped: number }
  interface Warning { err?: boolean; msg: string }
  ```
- Produces (`lib/qr.ts`):
  ```ts
  const ECL: { L: 0; M: 1; Q: 2; H: 3 }
  interface QrCode { size: number; modules: boolean[][]; version: number; ecl: number; mask: number }
  interface EncodeOptions { ecl?: 'L' | 'M' | 'Q' | 'H' | number; minVersion?: number; maxVersion?: number; mask?: number }
  function encode(text: string, opts?: EncodeOptions): QrCode   // throws Error('Data too long for a QR code at this error-correction level')
  function wifiPayload(o: { ssid?: string; password?: string; auth?: Auth; hidden?: boolean }): string
  function toSvgPath(qr: QrCode, margin?: number): { path: string; dim: number }   // margin defaults to 4
  ```

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type Auth = 'WPA' | 'WEP' | 'nopass';
export type Design = '1' | '2';
export type BulkMode = 'replace' | 'append' | 'merge';

export interface UnitData {
  ref: string;
  ssid: string;
  pass: string;
  auth: Auth;
  hidden: boolean;
}

/* `id` lives only in memory, as a stable React key. It is never saved. */
export interface Unit extends UnitData {
  id: string;
}

export interface Options {
  showRef: boolean;
  showPayload: boolean;
  design: Design;
}

export interface AppState {
  units: Unit[];
  options: Options;
}

export interface PlanItem {
  line: number;
  u: UnitData;
  notes: string[];
  action: 'add' | 'update' | 'skip';
  at?: number;
}

export interface Plan {
  mode: BulkMode;
  delim: string;
  header: boolean;
  items: PlanItem[];
  added: number;
  updated: number;
  skipped: number;
}

export interface Warning {
  err?: boolean;
  msg: string;
}
```

- [ ] **Step 2: Generate fixtures from the legacy encoder**

Run from the repo root:
```bash
mkdir -p lib/__fixtures__
node <<'EOF'
const QR = require('./js/qr.js');
const fs = require('fs');
const wifi = (ssid, password, auth = 'WPA', hidden = false) => QR.wifiPayload({ ssid, password, auth, hidden });
const payloads = [
  '',
  'a',
  wifi('Net', 'secret123'),
  wifi('Lisbeyond_Alfama', 'Bemvindo2026'),
  wifi('Café;Ação', 'pa:ss,wo"rd\\x'),
  wifi('Open Net', '', 'nopass'),
  wifi('Old', 'abcde', 'WEP', true),
  wifi('Lisbeyond_PRoyal', 'x'.repeat(95)),
  'https://example.com/' + 'y'.repeat(60),
  'z'.repeat(150),
  'Olá Lisboa 🌍 ' + 'w'.repeat(40),
];
const cases = [];
for (const payload of payloads) for (const ecl of ['L', 'M', 'Q', 'H']) cases.push({ payload, opts: { ecl } });
cases.push({ payload: wifi('Net', 'secret123'), opts: { ecl: 'Q', mask: 3 } });
cases.push({ payload: 'a', opts: { ecl: 'M', minVersion: 7 } });
const out = cases.map(({ payload, opts }) => {
  const q = QR.encode(payload, opts);
  return { payload, opts, version: q.version, size: q.size, mask: q.mask,
    rows: q.modules.map((r) => r.map((b) => (b ? '1' : '0')).join('')) };
});
fs.writeFileSync('lib/__fixtures__/qr.json', JSON.stringify(out, null, 1) + '\n');
console.log(out.length, 'cases; versions', [...new Set(out.map((c) => c.version))].sort((a, b) => a - b).join(','));
EOF
```
Expected: `46 cases; versions ...`. The list must include at least one version of 7 or more, and at least one of 10 or more.

- [ ] **Step 3: Write the failing tests `lib/qr.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encode, toSvgPath, wifiPayload, type EncodeOptions } from './qr';

interface Fixture {
  payload: string;
  opts: EncodeOptions;
  version: number;
  size: number;
  mask: number;
  rows: string[];
}

const fixtures: Fixture[] = JSON.parse(
  readFileSync(new URL('./__fixtures__/qr.json', import.meta.url), 'utf8'),
);

const asRows = (m: boolean[][]) => m.map((r) => r.map((b) => (b ? '1' : '0')).join(''));

describe('encode matches the legacy js/qr.js output', () => {
  it('has fixtures', () => {
    expect(fixtures).toHaveLength(46);
  });

  fixtures.forEach((c, i) => {
    it(`case ${i}: ${JSON.stringify(c.payload).slice(0, 32)} ${JSON.stringify(c.opts)}`, () => {
      const q = encode(c.payload, c.opts);
      expect(q.version).toBe(c.version);
      expect(q.size).toBe(c.size);
      expect(q.mask).toBe(c.mask);
      expect(asRows(q.modules)).toEqual(c.rows);
    });
  });

  it('throws when the data does not fit', () => {
    expect(() => encode('x'.repeat(3000), { ecl: 'H' })).toThrow(
      'Data too long for a QR code at this error-correction level',
    );
  });

  it('defaults to ECC level Q', () => {
    expect(encode('a').ecl).toBe(2);
  });
});

describe('wifiPayload', () => {
  it('builds a WPA payload', () => {
    expect(wifiPayload({ ssid: 'Net', password: 'secret123', auth: 'WPA' })).toBe('WIFI:T:WPA;S:Net;P:secret123;;');
  });

  it('escapes \\ ; , : and "', () => {
    expect(wifiPayload({ ssid: String.raw`a;b,c:d"e\f`, password: 'p' })).toBe(
      String.raw`WIFI:T:WPA;S:a\;b\,c\:d\"e\\f;P:p;;`,
    );
  });

  it('omits the password for open networks', () => {
    expect(wifiPayload({ ssid: 'Open', password: 'ignored', auth: 'nopass' })).toBe('WIFI:T:nopass;S:Open;;');
  });

  it('marks hidden networks', () => {
    expect(wifiPayload({ ssid: 'Old', password: 'abcde', auth: 'WEP', hidden: true })).toBe(
      'WIFI:T:WEP;S:Old;P:abcde;H:true;;',
    );
  });

  it('treats missing fields as empty and auth as WPA', () => {
    expect(wifiPayload({})).toBe('WIFI:T:WPA;S:;P:;;');
  });
});

describe('toSvgPath', () => {
  it('adds the margin on both sides and draws one square per dark module', () => {
    const q = encode('a', { ecl: 'Q' });
    const p = toSvgPath(q, 4);
    const dark = q.modules.flat().filter(Boolean).length;
    expect(p.dim).toBe(q.size + 8);
    expect(p.path.match(/M/g)).toHaveLength(dark);
    expect(p.path.startsWith('M')).toBe(true);
  });

  it('defaults the margin to 4', () => {
    const q = encode('a');
    expect(toSvgPath(q).dim).toBe(q.size + 8);
  });
});
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `npx vitest run lib/qr.test.ts`
Expected: FAIL, with `Failed to resolve import "./qr"`.

- [ ] **Step 5: Write `lib/qr.ts`**

```ts
/* Minimal QR Code encoder — byte mode, versions 1-40, ECC L/M/Q/H.
   Self-contained, with no dependencies. Ported line for line from the legacy
   js/qr.js; lib/__fixtures__/qr.json pins the output to the original. */
import type { Auth } from './types';

// ECC codewords per block, indexed [ecl][version]. ecl: 0=L 1=M 2=Q 3=H
const ECC_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// Number of error-correction blocks, indexed [ecl][version].
const NUM_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

// ---- GF(256) arithmetic, primitive polynomial 0x11D ----------------------
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

// Generator polynomial of the given degree, as coefficients (highest first,
// leading 1 implicit).
function rsDivisor(degree: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ (result.shift() as number);
    result.push(0);
    for (let j = 0; j < divisor.length; j++) result[j] ^= gfMul(divisor[j], factor);
  }
  return result;
}

// ---- Version geometry ----------------------------------------------------
function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(ver: number, ecl: number): number {
  return Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
}

function alignPatternPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 17 - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

// ---- Encoding ------------------------------------------------------------
function toUtf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.codePointAt(i) as number;
    if (c > 0xffff) i++;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}

function charCountBits(ver: number): number {
  return ver <= 9 ? 8 : 16;
}

function buildCodewords(bytes: number[], ver: number, ecl: number): number[] {
  const bits: number[] = [];
  const append = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  append(4, 4); // byte mode indicator
  append(bytes.length, charCountBits(ver));
  for (const b of bytes) append(b, 8);

  const capacityBits = numDataCodewords(ver, ecl) * 8;
  append(0, Math.min(4, capacityBits - bits.length)); // terminator
  append(0, (8 - (bits.length % 8)) % 8); // pad to byte boundary
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) append(pad, 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  return data;
}

// Split into blocks, add ECC, interleave.
function addEccAndInterleave(data: number[], ver: number, ecl: number): number[] {
  const numBlocks = NUM_BLOCKS[ecl][ver];
  const blockEccLen = ECC_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const divisor = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, divisor);
    // Short blocks carry a placeholder so every block is the same length and
    // the interleave below can walk them in lockstep; the placeholder column
    // is skipped, the ECC that follows it is not.
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      // the extra data codeword of long blocks sits after all short blocks
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        result.push(blocks[j][i]);
      }
    }
  }
  return result;
}

// ---- Matrix construction -------------------------------------------------
function makeMatrix(size: number): boolean[][] {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

function drawFunctionPatterns(modules: boolean[][], isFunction: boolean[][], ver: number, ecl: number): void {
  const size = modules.length;

  const setFn = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // timing patterns
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // finder patterns + separators
  for (const c of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = c[0] + dx, y = c[1] + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
  }

  // alignment patterns
  const pos = alignPatternPositions(ver);
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      // skip the three corners occupied by finder patterns
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFn(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  drawFormatBits(modules, isFunction, ecl, 0); // placeholder, redrawn with real mask

  // version information (version 7 and up)
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      setFn(a, b, bit);
      setFn(b, a, bit);
    }
  }
}

function drawFormatBits(modules: boolean[][], isFunction: boolean[][], ecl: number, mask: number): void {
  // ECC level format bits: L=01 M=00 Q=11 H=10
  const eclFormatBits = [1, 0, 3, 2][ecl];
  const data = (eclFormatBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = (((data << 10) | rem) ^ 0x5412) & 0x7fff;

  const size = modules.length;
  const setFn = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };
  const bit = (i: number) => ((bits >>> i) & 1) === 1;

  // first copy, around the top-left finder
  for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
  setFn(8, 7, bit(6));
  setFn(8, 8, bit(7));
  setFn(7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));

  // second copy, split between the other two finders
  for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
  setFn(8, size - 8, true); // always-dark module
}

function drawCodewords(modules: boolean[][], isFunction: boolean[][], data: number[]): void {
  const size = modules.length;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // column 6 is the timing pattern
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < data.length * 8) {
          modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

function applyMask(modules: boolean[][], isFunction: boolean[][], mask: number): void {
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert = false;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

// Penalty rule 3 helpers — a finder-like 1:1:3:1:1 run bounded by 4 light
// modules scores 40, counted over the run-length history of each line.
function finderPenaltyCountPatterns(runHistory: number[]): number {
  const n = runHistory[1];
  const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
  return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0)
       + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
}

function finderPenaltyTerminateAndCount(
  currentRunColor: boolean, currentRunLength: number, runHistory: number[], size: number,
): number {
  if (currentRunColor) { // ends with a dark run
    finderPenaltyAddHistory(currentRunLength, runHistory, size);
    currentRunLength = 0;
  }
  currentRunLength += size; // add light border to final run
  finderPenaltyAddHistory(currentRunLength, runHistory, size);
  return finderPenaltyCountPatterns(runHistory);
}

function finderPenaltyAddHistory(currentRunLength: number, runHistory: number[], size: number): void {
  if (runHistory[0] === 0) currentRunLength += size; // add light border to initial run
  runHistory.pop();
  runHistory.unshift(currentRunLength);
}

function getPenaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let result = 0;

  // rule 1 — runs of 5+ same-colour modules in a row / column
  // rule 3 — finder-like patterns, via run history
  for (let y = 0; y < size; y++) {
    let runColor = false, runX = 0;
    const runHistory = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      if (modules[y][x] === runColor) {
        runX++;
        if (runX === 5) result += PENALTY_N1;
        else if (runX > 5) result++;
      } else {
        finderPenaltyAddHistory(runX, runHistory, size);
        if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
        runColor = modules[y][x];
        runX = 1;
      }
    }
    result += finderPenaltyTerminateAndCount(runColor, runX, runHistory, size) * PENALTY_N3;
  }
  for (let x = 0; x < size; x++) {
    let runColor = false, runY = 0;
    const runHistory = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      if (modules[y][x] === runColor) {
        runY++;
        if (runY === 5) result += PENALTY_N1;
        else if (runY > 5) result++;
      } else {
        finderPenaltyAddHistory(runY, runHistory, size);
        if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
        runColor = modules[y][x];
        runY = 1;
      }
    }
    result += finderPenaltyTerminateAndCount(runColor, runY, runHistory, size) * PENALTY_N3;
  }

  // rule 2 — 2x2 blocks of the same colour
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  // rule 4 — deviation of dark module proportion from 50%
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;
  return result;
}

// ---- Public API ----------------------------------------------------------
export const ECL = { L: 0, M: 1, Q: 2, H: 3 } as const;

export interface QrCode {
  size: number;
  modules: boolean[][];
  version: number;
  ecl: number;
  mask: number;
}

export interface EncodeOptions {
  ecl?: keyof typeof ECL | number;
  minVersion?: number;
  maxVersion?: number;
  mask?: number;
}

export function encode(text: string, opts: EncodeOptions = {}): QrCode {
  const ecl = typeof opts.ecl === 'number' ? opts.ecl
    : opts.ecl !== undefined && ECL[opts.ecl] !== undefined ? ECL[opts.ecl] : ECL.Q;
  const minVersion = opts.minVersion || 1, maxVersion = opts.maxVersion || 40;
  const bytes = toUtf8Bytes(text);

  let ver = 0;
  for (let v = minVersion; v <= maxVersion; v++) {
    const capacityBits = numDataCodewords(v, ecl) * 8;
    const neededBits = 4 + charCountBits(v) + 8 * bytes.length;
    if (neededBits <= capacityBits) { ver = v; break; }
  }
  if (ver === 0) throw new Error('Data too long for a QR code at this error-correction level');

  const data = addEccAndInterleave(buildCodewords(bytes, ver, ecl), ver, ecl);
  const size = ver * 4 + 17;
  const modules = makeMatrix(size), isFunction = makeMatrix(size);

  drawFunctionPatterns(modules, isFunction, ver, ecl);
  drawCodewords(modules, isFunction, data);

  let mask = opts.mask ?? -1;
  if (mask < 0) {
    let minPenalty = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(modules, isFunction, m);
      drawFormatBits(modules, isFunction, ecl, m);
      const penalty = getPenaltyScore(modules);
      if (penalty < minPenalty) { mask = m; minPenalty = penalty; }
      applyMask(modules, isFunction, m); // masking is its own inverse
    }
  }
  applyMask(modules, isFunction, mask);
  drawFormatBits(modules, isFunction, ecl, mask);

  return { size, modules, version: ver, ecl, mask };
}

/* Builds the WIFI: payload string, escaping the characters the format
   reserves. Anything left unescaped here produces a QR that scans but joins
   the wrong network — or nothing at all. */
export function wifiPayload(o: { ssid?: string; password?: string; auth?: Auth; hidden?: boolean }): string {
  const esc = (s: string | undefined) => String(s ?? '').replace(/([\\;,:"])/g, '\\$1');
  const auth = o.auth || 'WPA'; // WPA | WEP | nopass
  const parts = ['WIFI:', 'T:' + auth + ';', 'S:' + esc(o.ssid) + ';'];
  if (auth !== 'nopass') parts.push('P:' + esc(o.password) + ';');
  if (o.hidden) parts.push('H:true;');
  parts.push(';');
  return parts.join('');
}

/* Renders a matrix as an SVG path string plus its viewBox dimension. */
export function toSvgPath(qr: QrCode, margin = 4): { path: string; dim: number } {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) parts.push('M' + (x + margin) + ',' + (y + margin) + 'h1v1h-1z');
    }
  }
  return { path: parts.join(''), dim: qr.size + margin * 2 };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run lib/qr.test.ts`
Expected: PASS, 56 tests (1 count check, 46 fixture cases, 2 encode tests, 5 wifiPayload tests, 2 toSvgPath tests). If a fixture case fails, compare the tables and the failing function against `js/qr.js` character by character. Do not edit the fixture.

- [ ] **Step 7: Lint, type-check and commit**

```bash
npm run lint && npx tsc --noEmit
git add lib
git commit -m "feat: port the QR encoder to TypeScript, pinned to legacy output by fixtures"
```

---

### Task 3: CSV import logic

**Files:**
- Create: `lib/csv.ts`, `lib/csv.test.ts`

**Interfaces:**
- Consumes: `UnitData`, `BulkMode`, `Plan`, `PlanItem`, `Auth` from `./types`.
- Produces:
  ```ts
  interface Field { v: string; q: boolean }
  const EXAMPLE: string
  function countOutside(text: string, ch: string): number
  function sniffDelim(text: string): string                  // '\t' | ';' | ','
  function parseDelimited(text: string, delim: string): Field[][]
  function normLabel(s: string): string
  function looksLikeHeader(r: Field[]): boolean
  function rowToUnit(r: Field[]): UnitData
  function refKey(s: string | undefined): string
  function buildPlan(text: string, mode: BulkMode, units: UnitData[]): Plan | null
  function delimName(d: string): 'tabs' | 'semicolons' | 'commas'
  function applyMessage(plan: Plan): string
  function csvField(s: string): string
  function listAsCsv(units: UnitData[]): string
  ```

- [ ] **Step 1: Write the failing tests `lib/csv.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  applyMessage, buildPlan, delimName, EXAMPLE, listAsCsv, looksLikeHeader, parseDelimited,
  rowToUnit, sniffDelim, type Field,
} from './csv';
import type { Plan, UnitData } from './types';

const unit = (over: Partial<UnitData> = {}): UnitData => ({
  ref: '', ssid: '', pass: '', auth: 'WPA', hidden: false, ...over,
});
const row = (s: string, d = ','): Field[] => parseDelimited(s, d)[0];

describe('sniffDelim', () => {
  it('picks the separator that occurs most', () => {
    expect(sniffDelim('a,b,c')).toBe(',');
    expect(sniffDelim('a;b;c')).toBe(';');
    expect(sniffDelim('a\tb\tc')).toBe('\t');
  });
  it('prefers tab, then semicolon, then comma on a tie', () => {
    expect(sniffDelim('a;b,c')).toBe(';');
    expect(sniffDelim('a\tb;c')).toBe('\t');
  });
  it('ignores separators inside quotes', () => {
    expect(sniffDelim('"x;y;z",b,c')).toBe(',');
  });
  it('defaults to comma', () => {
    expect(sniffDelim('abc')).toBe(',');
  });
});

describe('parseDelimited', () => {
  it('splits rows and fields', () => {
    expect(parseDelimited('a,b\nc,d', ',')).toEqual([
      [{ v: 'a', q: false }, { v: 'b', q: false }],
      [{ v: 'c', q: false }, { v: 'd', q: false }],
    ]);
  });
  it('handles doubled quotes and separators inside quotes', () => {
    expect(parseDelimited('"p,a""ss",x', ',')).toEqual([[{ v: 'p,a"ss', q: true }, { v: 'x', q: false }]]);
  });
  it('allows blanks before an opening quote and drops blanks after the closing one', () => {
    expect(parseDelimited('a, "b c" ,d', ',')).toEqual([
      [{ v: 'a', q: false }, { v: 'b c', q: true }, { v: 'd', q: false }],
    ]);
  });
  it('strips the BOM and handles CRLF', () => {
    expect(parseDelimited('﻿a;b\r\nc;d\r\n', ';').map((r) => r.map((f) => f.v))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('drops blank lines', () => {
    expect(parseDelimited('a,b\n\n , \nc,d', ',')).toHaveLength(2);
  });
  it('keeps unquoted fields raw (trimming happens later)', () => {
    expect(row(' a ,b')[0]).toEqual({ v: ' a ', q: false });
  });
});

describe('looksLikeHeader', () => {
  it('spots English and Portuguese headings', () => {
    expect(looksLikeHeader(row('Unit,Network,Password'))).toBe(true);
    expect(looksLikeHeader(row('Unidade;Rede;Palavra-passe', ';'))).toBe(true);
    expect(looksLikeHeader(row('Apartamento,Nome da rede,Senha'))).toBe(true);
    expect(looksLikeHeader(row('Imóvel,SSID,Código'))).toBe(true);
  });
  it('does not take a real first row for a header', () => {
    expect(looksLikeHeader(row('Alfama T2, Lisbeyond_Wifi, senha2026'))).toBe(false);
  });
  it('needs two matching columns', () => {
    expect(looksLikeHeader(row('Unit, Lisbeyond, x'))).toBe(false);
  });
});

describe('rowToUnit', () => {
  it('trims unquoted cells and keeps quoted ones as-is', () => {
    expect(rowToUnit(row(' Alfama T2 , Net ,"  spaced pass  "'))).toEqual(
      unit({ ref: 'Alfama T2', ssid: 'Net', pass: '  spaced pass  ' }),
    );
  });
  it('reads security from column 4', () => {
    expect(rowToUnit(row('A,Net,pw,open')).auth).toBe('nopass');
    expect(rowToUnit(row('A,Net,pw,Aberta')).auth).toBe('nopass');
    expect(rowToUnit(row('A,Net,pw,WEP')).auth).toBe('WEP');
    expect(rowToUnit(row('A,Net,pw,wpa2')).auth).toBe('WPA');
  });
  it('reads hidden from column 5', () => {
    expect(rowToUnit(row('A,Net,pw,,sim')).hidden).toBe(true);
    expect(rowToUnit(row('A,Net,pw,,Oculta')).hidden).toBe(true);
    expect(rowToUnit(row('A,Net,pw,,no')).hidden).toBe(false);
  });
});

describe('buildPlan', () => {
  it('returns null for blank input', () => {
    expect(buildPlan('', 'replace', [])).toBeNull();
    expect(buildPlan('   \n ', 'replace', [])).toBeNull();
  });

  it('turns a lone header line into an empty plan', () => {
    const plan = buildPlan('Unit,Network,Password', 'replace', [])!;
    expect(plan.header).toBe(true);
    expect(plan.items).toEqual([]);
    expect(plan.added).toBe(0);
  });

  it('reads the example as three new units after a header', () => {
    const plan = buildPlan(EXAMPLE, 'replace', [])!;
    expect(plan).toMatchObject({ mode: 'replace', delim: ',', header: true, added: 3, updated: 0, skipped: 0 });
    expect(plan.items.map((it) => [it.line, it.action, it.u.ref])).toEqual([
      [2, 'add', 'Alfama T2'],
      [3, 'add', 'Graça T1'],
      [4, 'add', 'Príncipe Real T3'],
    ]);
  });

  it('skips rows without a network name, saying why', () => {
    const plan = buildPlan('A only\n,,pw\nB,Net,secret123', 'replace', [])!;
    expect(plan.items.map((it) => [it.line, it.action, it.notes])).toEqual([
      [1, 'skip', ['only one column on this line — check the separator']],
      [2, 'skip', ['no network name']],
      [3, 'add', []],
    ]);
    expect(plan).toMatchObject({ added: 1, skipped: 2 });
  });

  it('notes problems on usable rows', () => {
    const plan = buildPlan(
      'A,Net\nB,Net2,short\nA,Net3,longenough1\nC,Net4,longenough1,WPA,no,extra\nD,Open,,open',
      'replace', [],
    )!;
    expect(plan.items.map((it) => it.notes)).toEqual([
      ['no password'],
      ['WPA password under 8 characters'],
      ['reference repeats line 1'],
      ['extra columns after column 5 ignored'],
      [],
    ]);
  });

  it('keeps a separator inside a quoted password', () => {
    const plan = buildPlan('A;Net;"pa;ss;word"', 'replace', [])!;
    expect(plan.delim).toBe(';');
    expect(plan.items[0].u.pass).toBe('pa;ss;word');
  });

  it('only adds in append mode', () => {
    const plan = buildPlan('Alfama T2,N,password1', 'append', [unit({ ref: 'Alfama T2', ssid: 'Old' })])!;
    expect(plan.items[0].action).toBe('add');
    expect(plan).toMatchObject({ added: 1, updated: 0 });
  });

  it('merges by reference, ignoring case and extra spaces, against existing units only', () => {
    const existing = [unit({ ref: 'Alfama  T2', ssid: 'Old' }), unit({ ref: '', ssid: 'X' })];
    const plan = buildPlan('alfama t2,NewNet,newpass123\nGraça,G,graça1234\nGRAÇA,G2,graça1234', 'merge', existing)!;
    expect(plan.items.map((it) => [it.action, it.at, it.notes])).toEqual([
      ['update', 0, []],
      ['add', undefined, []],
      ['add', undefined, ['reference repeats line 2']],
    ]);
    expect(plan).toMatchObject({ updated: 1, added: 2 });
  });

  it('matches the first of two existing units with the same reference', () => {
    const plan = buildPlan('X,N,password1', 'merge', [unit({ ref: 'X' }), unit({ ref: 'x' })])!;
    expect(plan.items[0].at).toBe(0);
  });
});

describe('delimName', () => {
  it('names the separator', () => {
    expect(delimName('\t')).toBe('tabs');
    expect(delimName(';')).toBe('semicolons');
    expect(delimName(',')).toBe('commas');
  });
});

describe('applyMessage', () => {
  const plan = (p: Partial<Plan>): Plan => ({
    mode: 'replace', delim: ',', header: false, items: [], added: 0, updated: 0, skipped: 0, ...p,
  });
  const tail = ' Check the warnings under the table before printing.';

  it('describes a replace', () => {
    expect(applyMessage(plan({ added: 3 }))).toBe('Replaced the list with 3 units.' + tail);
    expect(applyMessage(plan({ added: 1 }))).toBe('Replaced the list with 1 unit.' + tail);
  });
  it('describes a merge with skips', () => {
    expect(applyMessage(plan({ mode: 'merge', updated: 1, added: 2, skipped: 1 }))).toBe(
      'Updated 1, added 2. 1 line skipped for having no network name.' + tail,
    );
  });
  it('describes an append with skips', () => {
    expect(applyMessage(plan({ mode: 'append', added: 2, skipped: 2 }))).toBe(
      'added 2. 2 lines skipped for having no network name.' + tail,
    );
  });
});

describe('listAsCsv', () => {
  const units = [
    unit({ ref: 'A', ssid: 'N,1', pass: 'p"q' }),
    unit(),
    unit({ ssid: 'O', auth: 'nopass', hidden: true }),
    unit({ ref: 'W', ssid: 'Old', pass: 'abcde', auth: 'WEP' }),
  ];

  it('quotes what needs quoting and skips empty rows', () => {
    expect(listAsCsv(units)).toBe(
      'Unit reference,Network name,Password,Security,Hidden\n' +
      'A,"N,1","p""q",WPA,\n' +
      ',O,,nopass,yes\n' +
      'W,Old,abcde,WEP,',
    );
  });

  it('reads back through buildPlan to the same units', () => {
    const plan = buildPlan(listAsCsv(units), 'replace', [])!;
    expect(plan.header).toBe(true);
    expect(plan.items.map((it) => it.u)).toEqual([units[0], units[2], units[3]]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/csv.test.ts`
Expected: FAIL, with `Failed to resolve import "./csv"`.

- [ ] **Step 3: Write `lib/csv.ts`**

```ts
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

export function csvField(s: string): string {
  s = String(s ?? '');
  return /[",;\t\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function listAsCsv(units: UnitData[]): string {
  const lines = ['Unit reference,Network name,Password,Security,Hidden'];
  for (const u of units) {
    if (!(u.ref || u.ssid || u.pass)) continue;
    lines.push([u.ref, u.ssid, u.pass, u.auth, u.hidden ? 'yes' : ''].map(csvField).join(','));
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/csv.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Lint, type-check and commit**

```bash
npm run lint && npx tsc --noEmit
git add lib/csv.ts lib/csv.test.ts
git commit -m "feat: port CSV parsing, header detection and import planning"
```

---

### Task 4: Guardrail checks

**Files:**
- Create: `lib/checks.ts`, `lib/checks.test.ts`

**Interfaces:**
- Consumes: `encode`, `wifiPayload` from `./qr`; `UnitData`, `Warning` from `./types`.
- Produces: `function checkAll(list: UnitData[]): Warning[]`. The caller passes active units only.

- [ ] **Step 1: Write the failing tests `lib/checks.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkAll } from './checks';
import type { UnitData } from './types';

const unit = (over: Partial<UnitData> = {}): UnitData => ({
  ref: 'A', ssid: 'N', pass: 'password1', auth: 'WPA', hidden: false, ...over,
});

describe('checkAll', () => {
  it('passes a good unit', () => {
    expect(checkAll([unit()])).toEqual([]);
  });

  it('flags a missing password', () => {
    expect(checkAll([unit({ pass: '' })])).toEqual([
      { err: true, msg: '"A" has no password. Set one, or switch it to "Open, no password".' },
    ]);
  });

  it('accepts an open network without a password', () => {
    expect(checkAll([unit({ pass: '', auth: 'nopass' })])).toEqual([]);
  });

  it('flags a short WPA password but not a short WEP one', () => {
    expect(checkAll([unit({ pass: 'short' })])).toEqual([
      { err: true, msg: '"A": a WPA password must be at least 8 characters — phones will refuse to join.' },
    ]);
    expect(checkAll([unit({ pass: 'abc', auth: 'WEP' })])).toEqual([]);
  });

  it('flags leading or trailing spaces, naming the network when there is no reference', () => {
    expect(checkAll([unit({ ref: '', ssid: 'N ' })])).toEqual([
      { err: true, msg: 'network "N " starts or ends with a space. That is almost always a typo, and it will not join.' },
    ]);
  });

  it('flags a repeated network and password', () => {
    expect(checkAll([unit(), unit({ ref: 'B' })])).toEqual([
      { msg: '"B" repeats the same network and password as "A".' },
    ]);
  });

  it('flags a dense QR', () => {
    const w = checkAll([unit({ pass: 'x'.repeat(95) })]);
    expect(w).toHaveLength(1);
    expect(w[0].err).toBeUndefined();
    expect(w[0].msg).toMatch(/^"A" makes a dense QR \(version 1\d\)\. It still scans, but a shorter password prints more reliably\.$/);
  });

  it('flags accented characters', () => {
    expect(checkAll([unit({ ssid: 'Café' })])).toEqual([
      {
        msg: '"A" contains accented or non-English characters. They are encoded correctly, ' +
          'but a few older Android scanners mis-read them — worth testing one card.',
      },
    ]);
  });

  it('reports a payload too long to encode', () => {
    expect(checkAll([unit({ pass: 'x'.repeat(3000) })])).toEqual([
      { err: true, msg: '"A": Data too long for a QR code at this error-correction level' },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/checks.test.ts`
Expected: FAIL, with `Failed to resolve import "./checks"`.

- [ ] **Step 3: Write `lib/checks.ts`**

```ts
/* These are the failure modes that produce a card nobody can use: a QR that
   scans into the wrong credentials, or one too dense to read off paper. */
import { encode, wifiPayload } from './qr';
import type { UnitData, Warning } from './types';

export function checkAll(list: UnitData[]): Warning[] {
  const out: Warning[] = [];
  const seen: Record<string, string> = {};

  for (const u of list) {
    const who = u.ref ? '"' + u.ref + '"' : 'network "' + u.ssid + '"';

    if (u.auth !== 'nopass' && !u.pass) {
      out.push({ err: true, msg: who + ' has no password. Set one, or switch it to "Open, no password".' });
    }
    if (u.auth === 'WPA' && u.pass && u.pass.length < 8) {
      out.push({ err: true, msg: who + ': a WPA password must be at least 8 characters — phones will refuse to join.' });
    }
    if (/^\s|\s$/.test(u.ssid) || /^\s|\s$/.test(u.pass)) {
      out.push({ err: true, msg: who + ' starts or ends with a space. That is almost always a typo, and it will not join.' });
    }

    const key = JSON.stringify([u.ssid, u.pass]);
    if (seen[key]) out.push({ msg: who + ' repeats the same network and password as ' + seen[key] + '.' });
    else seen[key] = who;

    const payload = wifiPayload({ ssid: u.ssid, password: u.pass, auth: u.auth, hidden: u.hidden });
    try {
      const qr = encode(payload, { ecl: 'Q' });
      if (qr.version >= 10) {
        out.push({
          msg: who + ' makes a dense QR (version ' + qr.version +
            '). It still scans, but a shorter password prints more reliably.',
        });
      }
    } catch (e) {
      out.push({ err: true, msg: who + ': ' + (e instanceof Error ? e.message : String(e)) });
    }

    if (/[^\x20-\x7E]/.test(u.ssid + u.pass)) {
      out.push({
        msg: who + ' contains accented or non-English characters. They are encoded correctly, ' +
          'but a few older Android scanners mis-read them — worth testing one card.',
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/checks.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Lint, type-check and commit**

```bash
npm run lint && npx tsc --noEmit
git add lib/checks.ts lib/checks.test.ts
git commit -m "feat: port the card guardrail checks"
```

---

### Task 5: Units reducer and storage

**Files:**
- Create: `lib/units.ts`, `lib/units.test.ts`, `lib/storage.ts`, `lib/storage.test.ts`

**Interfaces:**
- Consumes: types from `./types`.
- Produces (`lib/units.ts`):
  ```ts
  function newId(): string
  function blank(): Unit
  function withId(u: UnitData): Unit
  function hasContent(u: UnitData): boolean            // ref || ssid || pass
  function needsNetworkName(u: UnitData): boolean      // hasContent && !ssid.trim()
  function activeUnits<T extends UnitData>(units: T[]): T[]   // ssid.trim() !== ''
  const DEFAULT_OPTIONS: Options                       // { showRef: true, showPayload: false, design: '1' }
  function initialState(): AppState                    // { units: [blank()], options: {...DEFAULT_OPTIONS} }
  type Action =
    | { type: 'add' }
    | { type: 'update'; id: string; patch: Partial<UnitData> }
    | { type: 'remove'; id: string }
    | { type: 'clear' }
    | { type: 'applyPlan'; plan: Plan }
    | { type: 'setOptions'; patch: Partial<Options> }
  function reducer(state: AppState, action: Action): AppState
  ```
- Produces (`lib/storage.ts`):
  ```ts
  const STORE = 'lisbeyond.wificards.v1'
  function loadState(): AppState
  function saveState(state: AppState): void
  ```

- [ ] **Step 1: Write the failing tests `lib/units.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { activeUnits, blank, hasContent, initialState, needsNetworkName, reducer } from './units';
import type { AppState, Plan, PlanItem, Unit, UnitData } from './types';

const data = (over: Partial<UnitData> = {}): UnitData => ({
  ref: '', ssid: '', pass: '', auth: 'WPA', hidden: false, ...over,
});
const unitWith = (id: string, over: Partial<UnitData> = {}): Unit => ({ id, ...data(over) });
const state = (units: Unit[]): AppState => ({ units, options: { showRef: true, showPayload: false, design: '1' } });
const strip = (units: Unit[]) => units.map(({ id: _id, ...u }) => u);
const item = (action: PlanItem['action'], u: UnitData, at?: number): PlanItem => ({ line: 1, u, notes: [], action, at });
const plan = (mode: Plan['mode'], items: PlanItem[]): Plan => ({
  mode, delim: ',', header: false, items,
  added: items.filter((i) => i.action === 'add').length,
  updated: items.filter((i) => i.action === 'update').length,
  skipped: items.filter((i) => i.action === 'skip').length,
});

describe('blank and initialState', () => {
  it('makes empty WPA units with unique ids', () => {
    const a = blank(), b = blank();
    expect(strip([a])).toEqual([data()]);
    expect(a.id).not.toBe(b.id);
  });
  it('starts with one blank unit and default options', () => {
    const s = initialState();
    expect(strip(s.units)).toEqual([data()]);
    expect(s.options).toEqual({ showRef: true, showPayload: false, design: '1' });
  });
});

describe('whitespace-only network names', () => {
  const u = data({ ref: 'A', ssid: '   ' });
  it('count as content but not as an active unit, and need a network name', () => {
    expect(hasContent(u)).toBe(true);
    expect(activeUnits([u])).toEqual([]);
    expect(needsNetworkName(u)).toBe(true);
  });
  it('an empty row does not need a network name', () => {
    expect(needsNetworkName(data())).toBe(false);
  });
});

describe('reducer', () => {
  it('add appends a blank unit', () => {
    const s = reducer(state([unitWith('a', { ssid: 'N' })]), { type: 'add' });
    expect(s.units).toHaveLength(2);
    expect(strip(s.units.slice(1))).toEqual([data()]);
  });

  it('update keeps ids and untouched units', () => {
    const a = unitWith('a', { ssid: 'N' }), b = unitWith('b', { ssid: 'M' });
    const s = reducer(state([a, b]), { type: 'update', id: 'a', patch: { pass: 'secret123' } });
    expect(s.units[0]).toEqual({ ...a, pass: 'secret123' });
    expect(s.units[0].id).toBe('a');
    expect(s.units[1]).toBe(b);
  });

  it('remove drops the unit, and leaves a blank when the list empties', () => {
    const s = reducer(state([unitWith('a'), unitWith('b')]), { type: 'remove', id: 'a' });
    expect(s.units.map((u) => u.id)).toEqual(['b']);
    const empty = reducer(state([unitWith('a', { ssid: 'N' })]), { type: 'remove', id: 'a' });
    expect(strip(empty.units)).toEqual([data()]);
  });

  it('clear leaves one blank unit', () => {
    const s = reducer(state([unitWith('a', { ssid: 'N' }), unitWith('b')]), { type: 'clear' });
    expect(strip(s.units)).toEqual([data()]);
  });

  it('setOptions merges', () => {
    const s = reducer(state([]), { type: 'setOptions', patch: { design: '2' } });
    expect(s.options).toEqual({ showRef: true, showPayload: false, design: '2' });
  });

  it('applyPlan replace makes the plan the list, without skipped rows', () => {
    const s = reducer(state([unitWith('a', { ssid: 'Old' })]), {
      type: 'applyPlan',
      plan: plan('replace', [item('add', data({ ssid: 'N1' })), item('skip', data()), item('add', data({ ssid: 'N2' }))]),
    });
    expect(strip(s.units)).toEqual([data({ ssid: 'N1' }), data({ ssid: 'N2' })]);
    expect(new Set(s.units.map((u) => u.id)).size).toBe(2);
  });

  it('applyPlan append drops empty starter rows and appends', () => {
    const s = reducer(state([unitWith('a', { ssid: 'Old' }), unitWith('b')]), {
      type: 'applyPlan', plan: plan('append', [item('add', data({ ssid: 'N1' }))]),
    });
    expect(strip(s.units)).toEqual([data({ ssid: 'Old' }), data({ ssid: 'N1' })]);
  });

  it('applyPlan merge replaces matched units in place', () => {
    const s = reducer(state([unitWith('a', { ref: 'A', ssid: 'Old' }), unitWith('b', { ref: 'B', ssid: 'Keep' })]), {
      type: 'applyPlan',
      plan: plan('merge', [item('update', data({ ref: 'A', ssid: 'New' }), 0), item('add', data({ ref: 'C', ssid: 'C' }))]),
    });
    expect(strip(s.units)).toEqual([
      data({ ref: 'A', ssid: 'New' }), data({ ref: 'B', ssid: 'Keep' }), data({ ref: 'C', ssid: 'C' }),
    ]);
  });

  it('applyPlan with nothing usable changes nothing', () => {
    const before = state([unitWith('a', { ssid: 'N' })]);
    expect(reducer(before, { type: 'applyPlan', plan: plan('replace', [item('skip', data())]) })).toBe(before);
  });
});
```

- [ ] **Step 2: Write the failing tests `lib/storage.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadState, saveState, STORE } from './storage';
import type { Unit } from './types';

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  };
}
const seed = (value: string) => vi.stubGlobal('localStorage', fakeStorage({ [STORE]: value }));
const strip = (units: Unit[]) => units.map(({ id: _id, ...u }) => u);
const blankData = { ref: '', ssid: '', pass: '', auth: 'WPA', hidden: false };
const defaults = { showRef: true, showPayload: false, design: '1' };

beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('loadState', () => {
  it('starts with one blank unit and default options when nothing is saved', () => {
    const s = loadState();
    expect(strip(s.units)).toEqual([blankData]);
    expect(s.options).toEqual(defaults);
  });

  it('reads the legacy format and gives every unit an id', () => {
    const units = [
      { ref: 'A', ssid: 'N', pass: 'password1', auth: 'WPA', hidden: false },
      { ref: 'B', ssid: 'O', pass: '', auth: 'nopass', hidden: true },
    ];
    seed(JSON.stringify({ units, showRef: false, showPayload: true, design: '2' }));
    const s = loadState();
    expect(strip(s.units)).toEqual(units);
    expect(new Set(s.units.map((u) => u.id)).size).toBe(2);
    expect(s.options).toEqual({ showRef: false, showPayload: true, design: '2' });
  });

  it.each(['not json', 'null', '"text"', '{"units":"nope"}', '{"units":[]}'])(
    'falls back to defaults for %s', (raw) => {
      seed(raw);
      const s = loadState();
      expect(strip(s.units)).toEqual([blankData]);
      expect(s.options).toEqual(defaults);
    },
  );

  it('sanitises units', () => {
    seed(JSON.stringify({
      units: [{ ssid: 'N' }, 'junk', null, { ref: 1, ssid: 'M', pass: 'p', auth: 'BOGUS', hidden: 'yes' }],
    }));
    expect(strip(loadState().units)).toEqual([
      { ...blankData, ssid: 'N' },
      { ...blankData, ssid: 'M', pass: 'p' },
    ]);
  });

  it('ignores options of the wrong type', () => {
    seed(JSON.stringify({ units: [], showRef: 'no', showPayload: 1, design: '3' }));
    expect(loadState().options).toEqual(defaults);
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
    expect(strip(loadState().units)).toEqual([blankData]);
  });
});

describe('saveState', () => {
  it('writes the legacy shape without ids', () => {
    saveState({
      units: [{ id: 'u1', ref: 'A', ssid: 'N', pass: 'p', auth: 'WPA', hidden: false }],
      options: { showRef: false, showPayload: true, design: '2' },
    });
    expect(localStorage.getItem(STORE)).toBe(
      '{"units":[{"ref":"A","ssid":"N","pass":"p","auth":"WPA","hidden":false}],"showRef":false,"showPayload":true,"design":"2"}',
    );
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('full'); } });
    expect(() => saveState({ units: [], options: { showRef: true, showPayload: false, design: '1' } })).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run lib/units.test.ts lib/storage.test.ts`
Expected: FAIL, with `Failed to resolve import "./units"` and `"./storage"`.

- [ ] **Step 4: Write `lib/units.ts`**

```ts
import type { AppState, Options, Plan, Unit, UnitData } from './types';

// A plain counter rather than crypto.randomUUID(), which only exists in secure
// contexts. Ids only need to be unique within one page load.
let lastId = 0;
export function newId(): string {
  return 'u' + ++lastId;
}

export function blank(): Unit {
  return { id: newId(), ref: '', ssid: '', pass: '', auth: 'WPA', hidden: false };
}

export function withId(u: UnitData): Unit {
  return { ...u, id: newId() };
}

export function hasContent(u: UnitData): boolean {
  return !!(u.ref || u.ssid || u.pass);
}

/* A row someone has started filling in but that cannot make a card yet. */
export function needsNetworkName(u: UnitData): boolean {
  return hasContent(u) && !u.ssid.trim();
}

/* The units that get a card. */
export function activeUnits<T extends UnitData>(units: T[]): T[] {
  return units.filter((u) => u.ssid.trim() !== '');
}

export const DEFAULT_OPTIONS: Options = { showRef: true, showPayload: false, design: '1' };

export function initialState(): AppState {
  return { units: [blank()], options: { ...DEFAULT_OPTIONS } };
}

export type Action =
  | { type: 'add' }
  | { type: 'update'; id: string; patch: Partial<UnitData> }
  | { type: 'remove'; id: string }
  | { type: 'clear' }
  | { type: 'applyPlan'; plan: Plan }
  | { type: 'setOptions'; patch: Partial<Options> };

// The editor always shows at least one row to type into.
function nonEmpty(units: Unit[]): Unit[] {
  return units.length ? units : [blank()];
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'add':
      return { ...state, units: [...state.units, blank()] };
    case 'update':
      return {
        ...state,
        units: state.units.map((u) => (u.id === action.id ? { ...u, ...action.patch } : u)),
      };
    case 'remove':
      return { ...state, units: nonEmpty(state.units.filter((u) => u.id !== action.id)) };
    case 'clear':
      return { ...state, units: [blank()] };
    case 'setOptions':
      return { ...state, options: { ...state.options, ...action.patch } };
    case 'applyPlan': {
      const { plan } = action;
      if (!(plan.added + plan.updated)) return state;
      const fresh = plan.items.filter((it) => it.action !== 'skip');
      let units: Unit[];
      if (plan.mode === 'replace') {
        units = fresh.map((it) => withId(it.u));
      } else {
        units = state.units.slice();
        for (const it of fresh) {
          if (it.action === 'update' && it.at !== undefined) units[it.at] = withId(it.u);
          else units.push(withId(it.u));
        }
        // A single untouched blank starter row is noise once real rows arrive.
        units = units.filter(hasContent);
      }
      return { ...state, units: nonEmpty(units) };
    }
  }
}
```

- [ ] **Step 5: Write `lib/storage.ts`**

```ts
/* Everything stays in this browser. The saved shape is the one the original
   page wrote, so lists saved before the migration still load. */
import { DEFAULT_OPTIONS, initialState, withId } from './units';
import type { AppState, Auth, Unit, UnitData } from './types';

export const STORE = 'lisbeyond.wificards.v1';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// Older saves or hand-edited storage may hold anything, so each unit is
// rebuilt field by field rather than trusted.
function toUnit(raw: unknown): Unit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const auth: Auth = r.auth === 'WEP' || r.auth === 'nopass' ? r.auth : 'WPA';
  return withId({ ref: str(r.ref), ssid: str(r.ssid), pass: str(r.pass), auth, hidden: r.hidden === true });
}

export function loadState(): AppState {
  const state = initialState();
  let saved: unknown;
  try {
    saved = JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return state;
  }
  if (!saved || typeof saved !== 'object') return state;
  const s = saved as Record<string, unknown>;

  if (Array.isArray(s.units)) {
    const units = s.units.map(toUnit).filter((u): u is Unit => u !== null);
    if (units.length) state.units = units;
  }
  state.options = {
    showRef: typeof s.showRef === 'boolean' ? s.showRef : DEFAULT_OPTIONS.showRef,
    showPayload: typeof s.showPayload === 'boolean' ? s.showPayload : DEFAULT_OPTIONS.showPayload,
    design: s.design === '1' || s.design === '2' ? s.design : DEFAULT_OPTIONS.design,
  };
  return state;
}

export function saveState(state: AppState): void {
  const units: UnitData[] = state.units.map(({ ref, ssid, pass, auth, hidden }) => ({ ref, ssid, pass, auth, hidden }));
  try {
    localStorage.setItem(STORE, JSON.stringify({
      units,
      showRef: state.options.showRef,
      showPayload: state.options.showPayload,
      design: state.options.design,
    }));
  } catch {
    /* private browsing — the page still works, it just won't remember */
  }
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS for every file in `lib/`.

- [ ] **Step 7: Lint, type-check and commit**

```bash
npm run lint && npx tsc --noEmit
git add lib/units.ts lib/units.test.ts lib/storage.ts lib/storage.test.ts
git commit -m "feat: add the units reducer and localStorage persistence"
```

If lint flags the `_id` variables in the tests as unused, add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` above each `strip` helper. Don't rename the variables.

---

### Task 6: App shell, card sheet, options and the comparison script

**Files:**
- Create: `components/useHydrated.ts`, `components/WifiCardsApp.tsx`, `components/Options.tsx`, `components/Sheet.tsx`, `components/QrSvg.tsx`, `components/CardFields.tsx`, `components/CardDesign1.tsx`, `components/CardDesign2.tsx`
- Modify: `app/page.tsx` (replace the placeholder)
- Scratch (not committed): `$PARITY/parity.mjs`, `$PARITY/old/index.html`

**Interfaces:**
- Consumes: `encode`, `wifiPayload`, `toSvgPath`, `QrCode` from `@/lib/qr`; `reducer`, `initialState`, `activeUnits`, `Action` from `@/lib/units`; `loadState`, `saveState` from `@/lib/storage`; types from `@/lib/types`.
- Produces:
  ```ts
  function useHydrated(): boolean
  default function Options(props: { options: Options; dispatch: Dispatch<Action> })
  default function Sheet(props: { units: Unit[]; options: Options })   // units = active units only
  default function QrSvg(props: { qr: QrCode; darkMm: number })
  interface CardProps { unit: UnitData; qr: ReactNode; unitRef: string; payload: string | null }
  default function CardFields(props: { unit: UnitData; payload: string | null })
  default function CardDesign1(props: CardProps)
  default function CardDesign2(props: CardProps)
  ```
- Comparison script: `node $PARITY/parity.mjs <print|screen|bulk|all>` exits 0 when old and new match.

Shell setup used by this task and Tasks 7–9:
```bash
PARITY=/private/tmp/claude-501/-Users-andrenunes-Development-personal-wifi-card/0efd29c0-9294-4ebd-b5fe-3a7456b2d1a1/scratchpad/parity
```

- [ ] **Step 1: Write `components/useHydrated.ts`**

```ts
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/* false during the static pre-render and the hydration pass, true after. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
```

- [ ] **Step 2: Write `components/QrSvg.tsx`**

```tsx
import { toSvgPath, type QrCode } from '@/lib/qr';

export default function QrSvg({ qr, darkMm }: { qr: QrCode; darkMm: number }) {
  // darkMm is the printed size of the dark square itself. The svg is drawn
  // larger to hold the quiet zone, then pulled back by exactly that margin,
  // so the square lines up with the gutter whatever version the QR lands on.
  const p = toSvgPath(qr, 4);
  const box = ((darkMm * p.dim) / qr.size).toFixed(2);
  const bleed = ((darkMm * 4) / qr.size).toFixed(2);
  return (
    <svg
      className="c-qr"
      viewBox={`0 0 ${p.dim} ${p.dim}`}
      style={{ width: `${box}mm`, height: `${box}mm`, margin: `-${bleed}mm` }}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
    >
      <rect width={p.dim} height={p.dim} />
      <path d={p.path} />
    </svg>
  );
}
```

- [ ] **Step 3: Write `components/CardFields.tsx`, `components/CardDesign1.tsx` and `components/CardDesign2.tsx`**

`components/CardFields.tsx`:
```tsx
import type { ReactNode } from 'react';
import type { UnitData } from '@/lib/types';

export interface CardProps {
  unit: UnitData;
  qr: ReactNode;
  unitRef: string; // empty when the reference is not printed
  payload: string | null; // null unless the debug payload is shown
}

export default function CardFields({ unit, payload }: { unit: UnitData; payload: string | null }) {
  return (
    <>
      <div className="c-field"><p className="c-label">Rede / Network</p><p className="c-value">{unit.ssid}</p></div>
      {unit.auth !== 'nopass' ? (
        <div className="c-field"><p className="c-label">Palavra-passe / Password</p><p className="c-value">{unit.pass}</p></div>
      ) : null}
      {payload !== null ? <div className="payload">{payload}</div> : null}
    </>
  );
}
```

`components/CardDesign1.tsx`:
```tsx
import CardFields, { type CardProps } from './CardFields';

/* Cream, plain: the code, the two credentials, the wordmark. */
export default function CardDesign1({ unit, qr, unitRef, payload }: CardProps) {
  return (
    <div className="c-frame">
      <div className="c-main">
        <div className="c-qrbox">
          <div className="c-qrwrap">
            {qr}
            <div className="c-under">
              <p className="c-scan">Aponte a câmara do telemóvel<span className="en">Point your phone camera</span></p>
              {unitRef ? <p className="c-ref">{unitRef}</p> : null}
            </div>
          </div>
        </div>
        <div className="c-body">
          <p className="c-title">Wi-Fi</p>
          <CardFields unit={unit} payload={payload} />
        </div>
      </div>
      <div className="c-foot">
        <img className="c-mark" src="/img/logo.png" alt="Lisbeyond" />
      </div>
    </div>
  );
}
```

`components/CardDesign2.tsx`:
```tsx
import CardFields, { type CardProps } from './CardFields';

/* Navy, speech bubble: the credentials in a bubble over the Lisbon skyline. */
export default function CardDesign2({ unit, qr, unitRef, payload }: CardProps) {
  return (
    <div className="c-frame">
      <img className="c-sky" src="/img/skyline.png" alt="" />
      <div className="c-bubble">
        <p className="c-say">Aponte a câmara do telemóvel.</p>
        <p className="c-say2">Point your phone camera.</p>
        <div className="c-row">
          <div className="c-qrbox">{qr}</div>
          <div className="c-body">
            <CardFields unit={unit} payload={payload} />
          </div>
        </div>
        <div className="c-tail"></div>
      </div>
      {unitRef ? <p className="c-ref">{unitRef}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Write `components/Sheet.tsx`**

```tsx
import { encode, wifiPayload, type QrCode } from '@/lib/qr';
import type { Options, Unit } from '@/lib/types';
import CardDesign1 from './CardDesign1';
import CardDesign2 from './CardDesign2';
import QrSvg from './QrSvg';

// Printed size of the QR's dark square, per design.
const DARK_MM = { '1': 58, '2': 40 } as const;

/* One A5 card per active unit, two to an A4 sheet; every second card carries
   the dashed cut line along its top. */
export default function Sheet({ units, options }: { units: Unit[]; options: Options }) {
  return (
    <div className="sheet" id="sheet">
      {units.length ? (
        units.map((u, i) => <Card key={u.id} unit={u} index={i} options={options} />)
      ) : (
        <div className="card">
          <p className="c-empty">Add a unit with a network name to see its card here.</p>
        </div>
      )}
    </div>
  );
}

function Card({ unit: u, index, options }: { unit: Unit; index: number; options: Options }) {
  const payload = wifiPayload({ ssid: u.ssid, password: u.pass, auth: u.auth, hidden: u.hidden });
  let code: QrCode | null = null;
  let error = '';
  try {
    code = encode(payload, { ecl: 'Q' });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const qr = code ? <QrSvg qr={code} darkMm={DARK_MM[options.design]} /> : <p className="c-empty">{error}</p>;
  const props = {
    unit: u,
    qr,
    unitRef: options.showRef ? u.ref : '',
    payload: options.showPayload ? payload : null,
  };
  const d2 = options.design === '2';
  return (
    <div className={'card' + (index % 2 === 1 ? ' cut-top' : '') + (d2 ? ' d2' : '')}>
      {d2 ? <CardDesign2 {...props} /> : <CardDesign1 {...props} />}
    </div>
  );
}
```

- [ ] **Step 5: Write `components/Options.tsx`**

```tsx
import type { Dispatch } from 'react';
import type { Action } from '@/lib/units';
import type { Design, Options as OptionsState } from '@/lib/types';

export default function Options({ options, dispatch }: { options: OptionsState; dispatch: Dispatch<Action> }) {
  const set = (patch: Partial<OptionsState>) => dispatch({ type: 'setOptions', patch });
  return (
    <div className="opts">
      <label><input type="checkbox" id="opt-ref" checked={options.showRef} onChange={(e) => set({ showRef: e.target.checked })} /> Print the unit reference on the card</label>
      <label><input type="checkbox" id="opt-payload" checked={options.showPayload} onChange={(e) => set({ showPayload: e.target.checked })} /> Show the QR payload (for debugging)</label>
      <label>Design <select id="opt-design" value={options.design} onChange={(e) => set({ design: e.target.value as Design })}>
        <option value="1">1 · Cream, plain</option>
        <option value="2">2 · Navy, speech bubble</option>
      </select></label>
    </div>
  );
}
```

- [ ] **Step 6: Write `components/WifiCardsApp.tsx` (the editor gets its other parts in Tasks 7 and 8) and `app/page.tsx`**

`components/WifiCardsApp.tsx`:
```tsx
'use client';

import { useEffect, useReducer } from 'react';
import { loadState, saveState } from '@/lib/storage';
import { activeUnits, initialState, reducer } from '@/lib/units';
import type { AppState } from '@/lib/types';
import Options from './Options';
import Sheet from './Sheet';
import { useHydrated } from './useHydrated';

// The static export is pre-rendered where there is no localStorage, so the
// server starts from defaults and the browser from what was saved. Nothing
// that depends on the state renders until hydration is over, which keeps the
// two from disagreeing.
function startingState(): AppState {
  return typeof window === 'undefined' ? initialState() : loadState();
}

export default function WifiCardsApp() {
  const [state, dispatch] = useReducer(reducer, undefined, startingState);
  const hydrated = useHydrated();

  // Saving only once hydrated means a default state can never be written over
  // a saved list.
  useEffect(() => {
    if (hydrated) saveState(state);
  }, [hydrated, state]);

  const active = activeUnits(state.units);

  return (
    <>
      <div className="masthead">
        <div className="inner">
          <p className="eyebrow">Lisbeyond · Ops</p>
          <h1>WiFi Cards</h1>
          <p className="date">One card per apartment · A5, two per A4 sheet</p>
        </div>
        <img className="logo" src="/img/logo.png" alt="Lisbeyond" />
      </div>
      <div className="masthead-rule"></div>

      <div className="wrap">
        <h2>The units</h2>
        <p className="lede">One row per apartment — type them in, or use <strong>Paste CSV</strong> to load a whole building at once from a spreadsheet. The QR joins the network in one tap on any modern phone; the printed name and password are there for laptops and older devices. Everything stays in this browser — nothing is uploaded.</p>

        {hydrated ? (
          <div className="editor">
            <Options options={state.options} dispatch={dispatch} />
          </div>
        ) : null}

        <h2>Preview</h2>
        <p className="preview-note">Exactly what prints: A4 portrait, two A5 landscape cards per sheet, cut across the dashed line. Use <strong>Print cards</strong> (or Cmd&nbsp;+&nbsp;P), set margins to <em>None</em> and turn <em>Background graphics</em> <strong>on</strong> — without it the cream ground and the red rule come out blank.</p>
        {hydrated ? (
          <div className="sheet-scroll">
            <Sheet units={active} options={state.options} />
          </div>
        ) : null}
      </div>
    </>
  );
}
```

`app/page.tsx`:
```tsx
import WifiCardsApp from '@/components/WifiCardsApp';

export default function Page() {
  return <WifiCardsApp />;
}
```

- [ ] **Step 7: Build, lint and type-check**

Run: `npm run build && npm run lint && npx tsc --noEmit`
Expected: the build succeeds with `/` static, and there are no lint or type errors.

- [ ] **Step 8: Set up the comparison script (scratch folder, not committed)**

Run:
```bash
PARITY=/private/tmp/claude-501/-Users-andrenunes-Development-personal-wifi-card/0efd29c0-9294-4ebd-b5fe-3a7456b2d1a1/scratchpad/parity
mkdir -p "$PARITY/old" && cp dist/index.html "$PARITY/old/index.html"
cd "$PARITY" && npm init -y >/dev/null && npm install playwright pngjs pixelmatch && npx playwright install chromium
```
Expected: the installs finish, and Chromium downloads or is already present.

Write `$PARITY/parity.mjs`:
```js
// Compares the legacy page (old/, served on 8101) with the Next export (out/,
// served on 8102), pixel for pixel. Usage: node parity.mjs <print|screen|bulk|all>
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { mkdirSync, writeFileSync } from 'node:fs';

const OLD = 'http://localhost:8101/';
const NEW = 'http://localhost:8102/';
const KEY = 'lisbeyond.wificards.v1';
const DIFF_DIR = new URL('./diffs/', import.meta.url);
mkdirSync(DIFF_DIR, { recursive: true });

const UNITS = [
  { ref: 'Alfama T2', ssid: 'Lisbeyond_Alfama', pass: 'Bemvindo2026', auth: 'WPA', hidden: false },
  { ref: 'Graça T1', ssid: 'Lisbeyond_Graça', pass: 'Olá;Lisboa,25"x', auth: 'WPA', hidden: true },
  { ref: '', ssid: 'Lisbeyond Guest Open', pass: '', auth: 'nopass', hidden: false },
  { ref: 'Príncipe Real T3', ssid: 'Lisbeyond_PRoyal', pass: 'x'.repeat(95), auth: 'WEP', hidden: false },
  { ref: 'Bad row', ssid: '', pass: 'short', auth: 'WPA', hidden: false },
  { ref: 'Short', ssid: ' Lisbeyond_Space', pass: 'abc', auth: 'WPA', hidden: false },
];
const EXPECTED_PAGES = Math.ceil(UNITS.filter((u) => u.ssid.trim()).length / 2);

const scope = process.argv[2] || 'all';
const browser = await chromium.launch();
const failures = [];

async function open(base, state, media, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(state)]);
  const page = await ctx.newPage();
  await page.emulateMedia({ media });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('#sheet .card');
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

function compare(name, a, b) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) {
    failures.push(`${name}: size old ${A.width}x${A.height} vs new ${B.width}x${B.height}`);
    writeFileSync(new URL(`${name}-old.png`, DIFF_DIR), a);
    writeFileSync(new URL(`${name}-new.png`, DIFF_DIR), b);
    return;
  }
  const diff = new PNG({ width: A.width, height: A.height });
  const n = pixelmatch(A.data, B.data, diff.data, A.width, A.height, { threshold: 0 });
  if (n) {
    failures.push(`${name}: ${n} pixels differ (see diffs/${name}.png)`);
    writeFileSync(new URL(`${name}.png`, DIFF_DIR), PNG.sync.write(diff));
    writeFileSync(new URL(`${name}-old.png`, DIFF_DIR), a);
    writeFileSync(new URL(`${name}-new.png`, DIFF_DIR), b);
  } else console.log(`ok   ${name}`);
}

async function pdfPages(page) {
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  return (pdf.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
}

if (scope === 'all' || scope === 'print') {
  for (const design of ['1', '2']) for (const showRef of [true, false]) for (const showPayload of [false, true]) {
    const state = { units: UNITS, showRef, showPayload, design };
    const name = `print-d${design}-ref${+showRef}-pay${+showPayload}`;
    const shots = [], pages = [];
    for (const base of [OLD, NEW]) {
      const { ctx, page } = await open(base, state, 'print', 794);
      shots.push(await page.screenshot({ fullPage: true }));
      pages.push(await pdfPages(page));
      await ctx.close();
    }
    compare(name, shots[0], shots[1]);
    if (pages[0] !== EXPECTED_PAGES || pages[1] !== EXPECTED_PAGES) {
      failures.push(`${name}: PDF pages old=${pages[0]} new=${pages[1]}, expected ${EXPECTED_PAGES}`);
    }
  }
}

if (scope === 'all' || scope === 'screen') {
  for (const design of ['1', '2']) {
    const state = { units: UNITS, showRef: true, showPayload: false, design };
    const shots = [];
    for (const base of [OLD, NEW]) {
      const { ctx, page } = await open(base, state, 'screen', 1280);
      shots.push(await page.screenshot({ fullPage: true }));
      if (base === NEW) {
        // Review focus 2: loading must not overwrite the saved list.
        const saved = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
        if (JSON.stringify(saved.units) !== JSON.stringify(UNITS) || saved.design !== design ||
            saved.showRef !== true || saved.showPayload !== false) {
          failures.push(`screen-d${design}: saved state changed on load: ${JSON.stringify(saved).slice(0, 120)}…`);
        }
      }
      await ctx.close();
    }
    compare(`screen-d${design}`, shots[0], shots[1]);
  }
}

if (scope === 'all' || scope === 'bulk') {
  const state = { units: UNITS, showRef: true, showPayload: false, design: '1' };
  const shots = [[], []];
  for (const [i, base] of [OLD, NEW].entries()) {
    const { ctx, page } = await open(base, state, 'screen', 1280);
    await page.click('#bulk-open');
    await page.click('#bulk-example');
    await page.check('input[name="bulk-mode"][value="merge"]');
    shots[i].push(await page.screenshot({ fullPage: true }));
    await page.click('#bulk-apply');
    shots[i].push(await page.screenshot({ fullPage: true }));
    // Review focus 4: the same paste cannot be applied twice.
    if (base === NEW && !(await page.isDisabled('#bulk-apply'))) failures.push('bulk: Apply still enabled after applying');
    await ctx.close();
  }
  compare('bulk-preview', shots[0][0], shots[1][0]);
  compare('bulk-applied', shots[0][1], shots[1][1]);
}

await browser.close();
if (failures.length) {
  console.log('\nFAILURES:\n' + failures.map((f) => '  ' + f).join('\n'));
  process.exit(1);
}
console.log('\nall comparisons match');
```

- [ ] **Step 9: Start the two local servers (keep them running in the background)**

Run each in the background:
```bash
python3 -m http.server 8101 --directory "$PARITY/old"
python3 -m http.server 8102 --directory /Users/andrenunes/Development/personal/wifi-card/out
```
`npm run build` rewrites `out/` in place, and the server picks up the new files without a restart.

- [ ] **Step 10: Compare the print output**

Run: `node "$PARITY/parity.mjs" print`
Expected: 8 `ok print-…` lines, then `all comparisons match`. Every case must have 3 PDF pages.

If a case fails, open `$PARITY/diffs/<name>-old.png`, `-new.png` and `<name>.png`. Fix the component markup to match `js/app.js` `cardEl()`. Do not change the CSS. Rebuild and rerun until every case matches.

- [ ] **Step 11: Commit**

```bash
git add components app/page.tsx
git commit -m "feat: render the card sheet and options in React"
```

---

### Task 7: Units table, toolbar and warnings

**Files:**
- Create: `components/UnitsTable.tsx`, `components/Toolbar.tsx`, `components/Warnings.tsx`
- Modify: `components/WifiCardsApp.tsx` (full replacement below)

**Interfaces:**
- Consumes: `needsNetworkName`, `Action` from `@/lib/units`; `checkAll` from `@/lib/checks`.
- Produces:
  ```ts
  default function UnitsTable(props: { units: Unit[]; dispatch: Dispatch<Action> })
  default function Toolbar(props: { count: number; onAdd: () => void; onToggleBulk: () => void; onClear: () => void })
  default function Warnings(props: { units: UnitData[] })   // active units
  ```

- [ ] **Step 1: Write `components/UnitsTable.tsx`**

```tsx
import type { Dispatch } from 'react';
import { needsNetworkName, type Action } from '@/lib/units';
import type { Auth, Unit, UnitData } from '@/lib/types';

export default function UnitsTable({ units, dispatch }: { units: Unit[]; dispatch: Dispatch<Action> }) {
  return (
    <table className="units">
      <thead>
        <tr>
          <th style={{ width: '20%' }}>Unit reference</th>
          <th style={{ width: '26%' }}>Network name (SSID)</th>
          <th style={{ width: '26%' }}>Password</th>
          <th style={{ width: '13%' }}>Security</th>
          <th style={{ width: '9%' }}>Hidden</th>
          <th style={{ width: '6%' }}></th>
        </tr>
      </thead>
      <tbody id="rows">
        {units.map((u) => <UnitRow key={u.id} unit={u} dispatch={dispatch} />)}
      </tbody>
    </table>
  );
}

// Keyed by id, so typing re-renders the row in place and never steals focus.
function UnitRow({ unit: u, dispatch }: { unit: Unit; dispatch: Dispatch<Action> }) {
  const set = (patch: Partial<UnitData>) => dispatch({ type: 'update', id: u.id, patch });
  return (
    <tr className={needsNetworkName(u) ? 'bad' : undefined}>
      <td><input type="text" className="ref" placeholder="Alfama T2" value={u.ref} onChange={(e) => set({ ref: e.target.value })} /></td>
      <td><input type="text" className="ssid mono" placeholder="Lisbeyond_Guest" value={u.ssid} onChange={(e) => set({ ssid: e.target.value })} /></td>
      <td><input type="text" className="pass mono" placeholder="Bemvindo2026" value={u.pass} onChange={(e) => set({ pass: e.target.value })} /></td>
      <td>
        <select className="auth" value={u.auth} onChange={(e) => set({ auth: e.target.value as Auth })}>
          <option value="WPA">WPA / WPA2 / WPA3</option>
          <option value="WEP">WEP (old)</option>
          <option value="nopass">Open, no password</option>
        </select>
      </td>
      <td className="mid"><input type="checkbox" className="hidden" checked={u.hidden} onChange={(e) => set({ hidden: e.target.checked })} /></td>
      <td className="mid"><button className="ghost tiny del" title="Remove this unit" onClick={() => dispatch({ type: 'remove', id: u.id })}>✕</button></td>
    </tr>
  );
}
```

- [ ] **Step 2: Write `components/Toolbar.tsx` and `components/Warnings.tsx`**

`components/Toolbar.tsx`:
```tsx
interface ToolbarProps {
  count: number;
  onAdd: () => void;
  onToggleBulk: () => void;
  onClear: () => void;
}

export default function Toolbar({ count, onAdd, onToggleBulk, onClear }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button id="add" onClick={onAdd}>+ Add unit</button>
      <button className="ghost" id="bulk-open" onClick={onToggleBulk}>Paste CSV…</button>
      <button className="ghost" id="clear" onClick={onClear}>Clear all</button>
      <span className="count" id="count">{count ? `${count} ${count === 1 ? 'card' : 'cards'}` : ''}</span>
      <span className="spacer"></span>
      <button id="print" onClick={() => window.print()}>Print cards</button>
    </div>
  );
}
```

`components/Warnings.tsx`:
```tsx
import { checkAll } from '@/lib/checks';
import type { UnitData } from '@/lib/types';

export default function Warnings({ units }: { units: UnitData[] }) {
  return (
    <ul className="warn-list" id="warnings">
      {checkAll(units).map((w, i) => (
        <li key={i} className={w.err ? 'err' : undefined}>{w.msg}</li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Replace `components/WifiCardsApp.tsx`**

```tsx
'use client';

import { useEffect, useReducer, useState } from 'react';
import { loadState, saveState } from '@/lib/storage';
import { activeUnits, initialState, reducer } from '@/lib/units';
import type { AppState } from '@/lib/types';
import Options from './Options';
import Sheet from './Sheet';
import Toolbar from './Toolbar';
import UnitsTable from './UnitsTable';
import Warnings from './Warnings';
import { useHydrated } from './useHydrated';

// The static export is pre-rendered where there is no localStorage, so the
// server starts from defaults and the browser from what was saved. Nothing
// that depends on the state renders until hydration is over, which keeps the
// two from disagreeing.
function startingState(): AppState {
  return typeof window === 'undefined' ? initialState() : loadState();
}

export default function WifiCardsApp() {
  const [state, dispatch] = useReducer(reducer, undefined, startingState);
  const [bulkOpen, setBulkOpen] = useState(false);
  const hydrated = useHydrated();

  // Saving only once hydrated means a default state can never be written over
  // a saved list.
  useEffect(() => {
    if (hydrated) saveState(state);
  }, [hydrated, state]);

  const active = activeUnits(state.units);

  const clear = () => {
    if (window.confirm('Remove every unit from the list?')) dispatch({ type: 'clear' });
  };

  return (
    <>
      <div className="masthead">
        <div className="inner">
          <p className="eyebrow">Lisbeyond · Ops</p>
          <h1>WiFi Cards</h1>
          <p className="date">One card per apartment · A5, two per A4 sheet</p>
        </div>
        <img className="logo" src="/img/logo.png" alt="Lisbeyond" />
      </div>
      <div className="masthead-rule"></div>

      <div className="wrap">
        <h2>The units</h2>
        <p className="lede">One row per apartment — type them in, or use <strong>Paste CSV</strong> to load a whole building at once from a spreadsheet. The QR joins the network in one tap on any modern phone; the printed name and password are there for laptops and older devices. Everything stays in this browser — nothing is uploaded.</p>

        {hydrated ? (
          <div className="editor">
            <UnitsTable units={state.units} dispatch={dispatch} />
            <Toolbar
              count={active.length}
              onAdd={() => dispatch({ type: 'add' })}
              onToggleBulk={() => setBulkOpen((o) => !o)}
              onClear={clear}
            />
            <Options options={state.options} dispatch={dispatch} />
            <Warnings units={active} />
          </div>
        ) : null}

        <h2>Preview</h2>
        <p className="preview-note">Exactly what prints: A4 portrait, two A5 landscape cards per sheet, cut across the dashed line. Use <strong>Print cards</strong> (or Cmd&nbsp;+&nbsp;P), set margins to <em>None</em> and turn <em>Background graphics</em> <strong>on</strong> — without it the cream ground and the red rule come out blank.</p>
        {hydrated ? (
          <div className="sheet-scroll">
            <Sheet units={active} options={state.options} />
          </div>
        ) : null}
      </div>
    </>
  );
}
```

`bulkOpen` isn't read until Task 8. If lint objects to the unused value, write `const [, setBulkOpen] = useState(false);` in this task and restore `bulkOpen` in Task 8.

- [ ] **Step 4: Build, lint, type-check, then compare print and screen**

Run:
```bash
npm run build && npm run lint && npx tsc --noEmit
node "$PARITY/parity.mjs" print && node "$PARITY/parity.mjs" screen
```
Expected: every print and screen case reports `ok`, and the saved-state check raises no failures. The old page's bulk panel is `hidden`, so leaving it out doesn't change the screen output. If a screen case differs, compare against `index.html` and `js/app.js` `drawRows()`. Look first for a missing or extra element, a class name, or whitespace in a text line.

- [ ] **Step 5: Try the editor in the dev server**

Run `npm run dev` in the background. Open http://localhost:3000 with Playwright or a browser, and check:
- Typing in a row's network field keeps focus and updates the card live.
- **+ Add unit** adds a row.
- ✕ removes a row. Removing the last row leaves one blank row.
- The count reads "N cards".
- A row with a reference but no network name gets the red network field (`tr.bad`).

Stop the dev server afterwards.

- [ ] **Step 6: Commit**

```bash
git add components
git commit -m "feat: add the units editor, toolbar and warnings"
```

---

### Task 8: Bulk CSV import panel

**Files:**
- Create: `components/BulkImport.tsx`
- Modify: `components/WifiCardsApp.tsx` (add the import and render `<BulkImport>` between `<Toolbar>` and `<Options>`)

**Interfaces:**
- Consumes: `buildPlan`, `applyMessage`, `delimName`, `listAsCsv`, `EXAMPLE` from `@/lib/csv`; `hasContent`, `Action` from `@/lib/units`.
- Produces: `default function BulkImport(props: { open: boolean; onClose: () => void; units: Unit[]; dispatch: Dispatch<Action> })`

- [ ] **Step 1: Write `components/BulkImport.tsx`**

```tsx
import { Fragment, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { applyMessage, buildPlan, delimName, EXAMPLE, listAsCsv } from '@/lib/csv';
import { hasContent, type Action } from '@/lib/units';
import type { BulkMode, Plan, PlanItem, Unit } from '@/lib/types';

const MODES: { value: BulkMode; label: string; hint: string }[] = [
  { value: 'replace', label: 'Replace the list', hint: 'The pasted rows become the whole list' },
  { value: 'append', label: 'Add to the list', hint: 'Keep what is there, append the new rows' },
  { value: 'merge', label: 'Update by reference', hint: 'Overwrite matching units, append the rest' },
];

const PLACEHOLDER = 'Unit,Network,Password\nAlfama T2,Lisbeyond_Alfama,Bemvindo2026\nGraça T1,Lisbeyond_Graca,OlaLisboa25';
const COPY_LABEL = 'Copy the current list as CSV';

interface BulkImportProps {
  open: boolean;
  onClose: () => void;
  units: Unit[];
  dispatch: Dispatch<Action>;
}

export default function BulkImport({ open, onClose, units, dispatch }: BulkImportProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<BulkMode>('replace');
  // The message left by Apply. While it shows, the preview is hidden and Apply
  // stays off, so the same paste cannot be applied twice.
  const [result, setResult] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState(COPY_LABEL);
  const csvRef = useRef<HTMLTextAreaElement>(null);

  // Reopening the panel starts a fresh look at whatever is in the box.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setResult(null);
  }

  useEffect(() => {
    if (open) csvRef.current?.focus();
  }, [open]);

  const plan = useMemo(() => buildPlan(text, mode, units), [text, mode, units]);
  const shown = result === null ? plan : null;
  const usable = shown ? shown.added + shown.updated : 0;

  const apply = () => {
    if (!plan || !(plan.added + plan.updated)) return;
    dispatch({ type: 'applyPlan', plan });
    setResult(applyMessage(plan));
  };

  const example = () => {
    setText(EXAMPLE);
    setResult(null);
    csvRef.current?.focus();
  };

  const copy = () => {
    const done = (ok: boolean) => {
      setCopyLabel(ok ? 'Copied' : 'Copy failed');
      setTimeout(() => setCopyLabel(COPY_LABEL), 1600);
    };
    if (!navigator.clipboard) return done(false);
    navigator.clipboard.writeText(listAsCsv(units)).then(() => done(true), () => done(false));
  };

  return (
    <div className="bulk noprint" id="bulk" hidden={!open}>
      <div className="bulk-top">
        <h3>Bulk update from a spreadsheet</h3>
        <button className="ghost tiny" id="bulk-close" onClick={onClose}>Close</button>
      </div>
      <p className="bulk-help">One line per apartment, in this order: <code>unit reference, network name, password</code> — commas, semicolons and tabs all work, so you can copy cells straight out of Excel or Google Sheets. Security is set to <strong>WPA/WPA2/WPA3</strong> on every row. A header line is spotted and skipped. Nothing changes until you press Apply.</p>
      <textarea
        id="csv"
        ref={csvRef}
        spellCheck={false}
        autoComplete="off"
        placeholder={PLACEHOLDER}
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null); }}
      />

      <div className="modes">
        {MODES.map((m) => (
          <label key={m.value}>
            <input type="radio" name="bulk-mode" value={m.value} checked={mode === m.value} onChange={() => { setMode(m.value); setResult(null); }} />
            <span>{m.label}<span className="hint">{m.hint}</span></span>
          </label>
        ))}
      </div>

      <Status plan={shown} result={result} units={units} />
      <div className="preview-scroll"><div id="bulk-preview">{shown ? <Preview plan={shown} /> : null}</div></div>

      <div className="toolbar">
        <button id="bulk-apply" disabled={!usable} onClick={apply}>Apply to the list</button>
        <button className="ghost" id="bulk-example" onClick={example}>Insert an example</button>
        <span className="spacer"></span>
        <button className="ghost" id="bulk-copy" onClick={copy}>{copyLabel}</button>
      </div>
    </div>
  );
}

function Status({ plan, result, units }: { plan: Plan | null; result: string | null; units: Unit[] }) {
  if (result !== null) return <div className="status ok" id="bulk-status">{result}</div>;
  if (!plan) return <div className="status" id="bulk-status">Paste your rows above to see what will happen.</div>;

  const usable = plan.added + plan.updated;
  const cls = 'status ' + (!usable ? 'err' : plan.skipped ? 'warn' : 'ok');
  if (!usable) {
    return (
      <div className={cls} id="bulk-status">
        {!plan.items.length
          ? 'That is just the header line — paste the unit rows underneath it.'
          : <>Nothing usable found — every line is missing a network name. Check that the columns are <b>reference, network, password</b>, and that the separator is a comma, a semicolon or a tab.</>}
      </div>
    );
  }

  const bits: ReactNode[] = [];
  if (plan.mode === 'replace') {
    const now = units.filter(hasContent).length;
    const n = <><b>{usable}</b> unit{usable === 1 ? '' : 's'}</>;
    bits.push(now ? <>{n} will replace the <b>{now}</b> now in the list</> : <>{n} will become the list</>);
  } else {
    if (plan.updated) bits.push(<><b>{plan.updated}</b> updated</>);
    bits.push(<><b>{plan.added}</b> added</>);
  }
  if (plan.skipped) bits.push(<><b>{plan.skipped}</b> skipped</>);
  bits.push('read as ' + delimName(plan.delim) + (plan.header ? ', header line skipped' : ''));

  return (
    <div className={cls} id="bulk-status">
      {bits.map((b, i) => <Fragment key={i}>{i > 0 ? ' · ' : null}{b}</Fragment>)}
    </div>
  );
}

function Preview({ plan }: { plan: Plan }) {
  return (
    <table className="preview">
      <thead>
        <tr><th>Line</th><th>Unit reference</th><th>Network</th><th>Password</th><th>Security</th><th></th></tr>
      </thead>
      <tbody>
        {plan.items.map((it) => (
          <tr key={it.line}>
            <td className="n">{it.line}</td>
            <td>{it.u.ref || <span className="why">—</span>}</td>
            <td className="m">{it.u.ssid}</td>
            <td className="m">{it.u.auth === 'nopass' ? <span className="why">open</span> : it.u.pass}</td>
            <td>{it.u.auth === 'WPA' ? 'WPA/2/3' : it.u.auth === 'WEP' ? 'WEP' : 'Open'}{it.u.hidden ? ' · hidden' : ''}</td>
            <td><Tag item={it} mode={plan.mode} />{it.notes.length ? <span className="why">{it.notes.join(' · ')}</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tag({ item, mode }: { item: PlanItem; mode: BulkMode }) {
  if (item.action === 'skip') return <span className="tag skip">Skipped</span>;
  if (item.action === 'update') return <span className="tag upd">Update</span>;
  if (mode === 'replace') return <span className="tag">Card</span>;
  return <span className="tag new">New</span>;
}
```

- [ ] **Step 2: Add the panel to `components/WifiCardsApp.tsx`**

Add the import next to the other component imports:
```tsx
import BulkImport from './BulkImport';
```
If Task 7 used `const [, setBulkOpen]`, change it back to `const [bulkOpen, setBulkOpen] = useState(false);`. Then put the panel between `<Toolbar … />` and `<Options … />`:
```tsx
            <BulkImport open={bulkOpen} onClose={() => setBulkOpen(false)} units={state.units} dispatch={dispatch} />
```

- [ ] **Step 3: Build, lint, type-check, then run every comparison**

Run:
```bash
npm run build && npm run lint && npx tsc --noEmit
node "$PARITY/parity.mjs" all
```
Expected:
- Every print, screen and bulk case reports `ok`.
- There are no `Apply still enabled` or saved-state failures.
- The output ends with `all comparisons match`.

If `bulk-preview` or `bulk-applied` differs, check the status wording and the preview table against `refreshBulk()` and `applyBulk()` in `js/app.js`.

- [ ] **Step 4: Check copy and reopen in the dev server**

Run `npm run dev` in the background. Open http://localhost:3000 and check:
- **Copy the current list as CSV** shows "Copied", then the label returns after about 1.6 s.
- After Apply, editing the text brings the preview back and turns Apply back on.
- Closing and reopening the panel also brings the preview back.
- `react-hooks` lint passed in Step 3. If it flagged the `wasOpen` block, raise it with the user rather than disabling the rule.

Stop the dev server afterwards.

- [ ] **Step 5: Commit**

```bash
git add components
git commit -m "feat: add the bulk CSV import panel"
```

---

### Task 9: Remove the legacy app and update the docs

**Files:**
- Delete: `index.html`, `css/`, `js/`, `assets/`, `build.py`, `dist/`
- Modify: `eslint.config.mjs` (remove `js/**` and `dist/**` from the ignores, and the comment above them), `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above. The comparison script keeps working because it serves its own copy of the old page from `$PARITY/old/`.

- [ ] **Step 1: Delete the legacy files**

```bash
git rm -r -q index.html css js assets build.py dist
```

- [ ] **Step 2: Remove the legacy ignores from `eslint.config.mjs`**

Replace the last two lines of the array:
```js
  // js/ and dist/ are the legacy app, kept as the reference until the migration ends.
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts', 'js/**', 'dist/**']),
```
with:
```js
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts']),
```

- [ ] **Step 3: Rewrite `README.md`**

```markdown
# WiFi Cards — Lisbeyond Ops

Prints one WiFi card per apartment (A5 landscape, two per A4 sheet) with a QR code
that joins the network. Runs entirely in the browser: no backend, no network calls
at run time. Data is kept in `localStorage` (key `lisbeyond.wificards.v1`).

Built with Next.js as a static export.

## Structure
    app/              layout, the single page, globals.css (all styles, incl. print layout and @font-face)
    components/       React UI: units table, toolbar, bulk CSV import, options, warnings, card sheet
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

## Key details
- QR payload: `WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<pass>;H:true;;` with `\ ; , : "` escaped. ECC level Q.
- Print: `@page { size: A4 portrait; margin: 0 }`; in the print dialog set margins to
  None and enable Background graphics.
- Brand tokens (CSS variables in `:root`): navy #13203C, red #C94030, cream #FAF0E4;
  design 2 uses #111A45 / #FDF1E4 / #E5422F.

## Licences — check before redistributing
Barlow, Barlow Condensed and Lexend are OFL. **Kento** and **LE Amalfi** are not
confirmed open-licensed: make sure the client holds a licence for them.
```

- [ ] **Step 4: Rewrite `CLAUDE.md`**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A WiFi card generator for Lisbeyond Ops, built as a static Next.js app. It prints one A5 landscape card per apartment, two per A4 portrait sheet, each with a QR code that joins the network. Everything runs in the browser: `output: 'export'`, no server code, no API routes, no network calls at run time. State lives in `localStorage` under `lisbeyond.wificards.v1`, in the same shape the pre-Next version wrote, so old saves still load.

## Commands

```sh
npm run dev                          # http://localhost:3000
npm run build                        # static export to out/ (the deploy artifact; drag onto Netlify)
npm run lint
npm test                             # Vitest over lib/**/*.test.ts
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

### The DOM is part of the print contract

`app/globals.css` is the original stylesheet, unchanged. Its print rules use child selectors such as `.wrap>h2`, and the card layout is in mm. Components therefore output a fixed tree of elements and class names. Don't add wrapper elements inside `.wrap`, `.editor`, `.sheet` or `.card`; use fragments. Keep user-visible text on one JSX line, or use `{' '}`, because JSX drops whitespace that contains a line break. Images are plain `<img>` and fonts are plain `@font-face` (no `next/image` or `next/font`), for the same reason.

## Printing

When printing, set margins to **None** and turn **Background graphics** on.

## Licensing

Barlow, Barlow Condensed and Lexend are OFL. **Kento** and **LE Amalfi** are not confirmed to be open-licensed, so check the client holds a licence before redistributing them.
```

- [ ] **Step 5: Run the full verification**

Run:
```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
node "$PARITY/parity.mjs" all
git status --short
```
Expected:
- All tests pass, with no lint or type errors.
- The build succeeds and the comparisons end with `all comparisons match`.
- `git status` lists only the deletions and the three modified files.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove the legacy static app and document the Next.js setup"
```

- [ ] **Step 7: Stop the background servers and report**

Stop both `python3 -m http.server` processes. Report to the user:
- The final output of `parity.mjs all`.
- The test count.
- The manual checks still for them to do: print one sheet of each design, and scan the QR codes with an iPhone and an Android phone.
