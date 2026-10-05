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
