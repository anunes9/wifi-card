/* Minimal QR Code encoder — byte mode, versions 1-40, ECC L/M/Q/H.
   Self-contained: no dependencies, works in Node and the browser.
   Returns a boolean[size][size] matrix (true = dark module). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ECC codewords per block, indexed [ecl][version]. ecl: 0=L 1=M 2=Q 3=H
  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];

  // Number of error-correction blocks, indexed [ecl][version].
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  var PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

  // ---- GF(256) arithmetic, primitive polynomial 0x11D ----------------------
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  // Generator polynomial of the given degree, as coefficients (highest first,
  // leading 1 implicit).
  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ result.shift();
      result.push(0);
      for (var j = 0; j < divisor.length; j++) result[j] ^= gfMul(divisor[j], factor);
    }
    return result;
  }

  // ---- Version geometry ----------------------------------------------------
  function numRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }

  function alignPatternPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = ver * 4 + 17 - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  // ---- Encoding ------------------------------------------------------------
  function toUtf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.codePointAt(i);
      if (c > 0xFFFF) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
    return out;
  }

  function charCountBits(ver) { return ver <= 9 ? 8 : 16; }

  function buildCodewords(bytes, ver, ecl) {
    var bits = [];
    function append(val, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    }
    append(4, 4);                              // byte mode indicator
    append(bytes.length, charCountBits(ver));
    for (var i = 0; i < bytes.length; i++) append(bytes[i], 8);

    var capacityBits = numDataCodewords(ver, ecl) * 8;
    append(0, Math.min(4, capacityBits - bits.length));   // terminator
    append(0, (8 - bits.length % 8) % 8);                 // pad to byte boundary
    for (var pad = 0xEC; bits.length < capacityBits; pad ^= 0xEC ^ 0x11) append(pad, 8);

    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    return data;
  }

  // Split into blocks, add ECC, interleave.
  function addEccAndInterleave(data, ver, ecl) {
    var numBlocks = NUM_BLOCKS[ecl][ver];
    var blockEccLen = ECC_PER_BLOCK[ecl][ver];
    var rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [], divisor = rsDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var len = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      var dat = data.slice(k, k + len);
      k += len;
      var ecc = rsRemainder(dat, divisor);
      // Short blocks carry a placeholder so every block is the same length and
      // the interleave below can walk them in lockstep; the placeholder column
      // is skipped, the ECC that follows it is not.
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    for (var i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        // the extra data codeword of long blocks sits after all short blocks
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          result.push(blocks[j][i]);
        }
      }
    }
    return result;
  }

  // ---- Matrix construction -------------------------------------------------
  function makeMatrix(size) {
    var m = [];
    for (var y = 0; y < size; y++) {
      m.push([]);
      for (var x = 0; x < size; x++) m[y].push(false);
    }
    return m;
  }

  function drawFunctionPatterns(modules, isFunction, ver, ecl) {
    var size = modules.length;

    function setFn(x, y, dark) {
      modules[y][x] = dark;
      isFunction[y][x] = true;
    }

    // timing patterns
    for (var i = 0; i < size; i++) {
      setFn(6, i, i % 2 === 0);
      setFn(i, 6, i % 2 === 0);
    }

    // finder patterns + separators
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          var x = c[0] + dx, y = c[1] + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
        }
      }
    });

    // alignment patterns
    var pos = alignPatternPositions(ver);
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        // skip the three corners occupied by finder patterns
        if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) {
            setFn(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }

    drawFormatBits(modules, isFunction, ecl, 0);   // placeholder, redrawn with real mask

    // version information (version 7 and up)
    if (ver >= 7) {
      var rem = ver;
      for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var bits = ver << 12 | rem;
      for (var i = 0; i < 18; i++) {
        var bit = ((bits >>> i) & 1) === 1;
        var a = size - 11 + i % 3, b = Math.floor(i / 3);
        setFn(a, b, bit);
        setFn(b, a, bit);
      }
    }
  }

  function drawFormatBits(modules, isFunction, ecl, mask) {
    // ECC level format bits: L=01 M=00 Q=11 H=10
    var eclFormatBits = [1, 0, 3, 2][ecl];
    var data = eclFormatBits << 3 | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10 | rem) ^ 0x5412) & 0x7FFF;

    var size = modules.length;
    function setFn(x, y, dark) { modules[y][x] = dark; isFunction[y][x] = true; }
    function bit(i) { return ((bits >>> i) & 1) === 1; }

    // first copy, around the top-left finder
    for (var i = 0; i <= 5; i++) setFn(8, i, bit(i));
    setFn(8, 7, bit(6));
    setFn(8, 8, bit(7));
    setFn(7, 8, bit(8));
    for (var i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));

    // second copy, split between the other two finders
    for (var i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
    for (var i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
    setFn(8, size - 8, true);   // always-dark module
  }

  function drawCodewords(modules, isFunction, data) {
    var size = modules.length, i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;                       // column 6 is the timing pattern
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && i < data.length * 8) {
            modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
    return modules;
  }

  function applyMask(modules, isFunction, mask) {
    var size = modules.length;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = x * y % 2 + x * y % 3 === 0; break;
          case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
        }
        if (invert) modules[y][x] = !modules[y][x];
      }
    }
  }

  // Penalty rule 3 helpers — a finder-like 1:1:3:1:1 run bounded by 4 light
  // modules scores 40, counted over the run-length history of each line.
  function finderPenaltyCountPatterns(runHistory, size) {
    var n = runHistory[1];
    var core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
    return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0)
         + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
  }

  function finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory, size) {
    if (currentRunColor) {                       // ends with a dark run
      finderPenaltyAddHistory(currentRunLength, runHistory, size);
      currentRunLength = 0;
    }
    currentRunLength += size;                    // add light border to final run
    finderPenaltyAddHistory(currentRunLength, runHistory, size);
    return finderPenaltyCountPatterns(runHistory, size);
  }

  function finderPenaltyAddHistory(currentRunLength, runHistory, size) {
    if (runHistory[0] === 0) currentRunLength += size;   // add light border to initial run
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  }

  function getPenaltyScore(modules) {
    var size = modules.length, result = 0;

    // rule 1 — runs of 5+ same-colour modules in a row / column
    // rule 3 — finder-like patterns, via run history
    for (var y = 0; y < size; y++) {
      var runColor = false, runX = 0, runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (var x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          finderPenaltyAddHistory(runX, runHistory, size);
          if (!runColor) result += finderPenaltyCountPatterns(runHistory, size) * PENALTY_N3;
          runColor = modules[y][x];
          runX = 1;
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runX, runHistory, size) * PENALTY_N3;
    }
    for (var x = 0; x < size; x++) {
      var runColor = false, runY = 0, runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (var y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += PENALTY_N1;
          else if (runY > 5) result++;
        } else {
          finderPenaltyAddHistory(runY, runHistory, size);
          if (!runColor) result += finderPenaltyCountPatterns(runHistory, size) * PENALTY_N3;
          runColor = modules[y][x];
          runY = 1;
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runY, runHistory, size) * PENALTY_N3;
    }

    // rule 2 — 2x2 blocks of the same colour
    for (var y = 0; y < size - 1; y++) {
      for (var x = 0; x < size - 1; x++) {
        var c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
          result += PENALTY_N2;
        }
      }
    }

    // rule 4 — deviation of dark module proportion from 50%
    var dark = 0;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (modules[y][x]) dark++;
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }

  // ---- Public API ----------------------------------------------------------
  var ECL = { L: 0, M: 1, Q: 2, H: 3 };

  /* encode(text, {ecl, minVersion, maxVersion, mask})
     → { size, modules, version, ecl, mask } */
  function encode(text, opts) {
    opts = opts || {};
    var ecl = typeof opts.ecl === 'number' ? opts.ecl : (ECL[opts.ecl] !== undefined ? ECL[opts.ecl] : ECL.Q);
    var minVersion = opts.minVersion || 1, maxVersion = opts.maxVersion || 40;
    var bytes = toUtf8Bytes(text);

    var ver = 0;
    for (var v = minVersion; v <= maxVersion; v++) {
      var capacityBits = numDataCodewords(v, ecl) * 8;
      var neededBits = 4 + charCountBits(v) + 8 * bytes.length;
      if (neededBits <= capacityBits) { ver = v; break; }
    }
    if (ver === 0) throw new Error('Data too long for a QR code at this error-correction level');

    var data = addEccAndInterleave(buildCodewords(bytes, ver, ecl), ver, ecl);
    var size = ver * 4 + 17;
    var modules = makeMatrix(size), isFunction = makeMatrix(size);

    drawFunctionPatterns(modules, isFunction, ver, ecl);
    drawCodewords(modules, isFunction, data);

    var mask = opts.mask;
    if (mask === undefined || mask === null || mask < 0) {
      var minPenalty = Infinity;
      for (var m = 0; m < 8; m++) {
        applyMask(modules, isFunction, m);
        drawFormatBits(modules, isFunction, ecl, m);
        var penalty = getPenaltyScore(modules);
        if (penalty < minPenalty) { mask = m; minPenalty = penalty; }
        applyMask(modules, isFunction, m);   // masking is its own inverse
      }
    }
    applyMask(modules, isFunction, mask);
    drawFormatBits(modules, isFunction, ecl, mask);

    return { size: size, modules: modules, version: ver, ecl: ecl, mask: mask };
  }

  /* Builds the WIFI: payload string, escaping the characters the format
     reserves. Anything left unescaped here produces a QR that scans but joins
     the wrong network — or nothing at all. */
  function wifiPayload(o) {
    function esc(s) {
      return String(s == null ? '' : s).replace(/([\\;,:"])/g, '\\$1');
    }
    var auth = o.auth || 'WPA';                       // WPA | WEP | nopass
    var parts = ['WIFI:', 'T:' + auth + ';', 'S:' + esc(o.ssid) + ';'];
    if (auth !== 'nopass') parts.push('P:' + esc(o.password) + ';');
    if (o.hidden) parts.push('H:true;');
    parts.push(';');
    return parts.join('');
  }

  /* Renders a matrix as an SVG path string plus its viewBox dimension. */
  function toSvgPath(qr, margin) {
    margin = margin === undefined ? 4 : margin;
    var parts = [];
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) parts.push('M' + (x + margin) + ',' + (y + margin) + 'h1v1h-1z');
      }
    }
    return { path: parts.join(''), dim: qr.size + margin * 2 };
  }

  return { encode: encode, wifiPayload: wifiPayload, toSvgPath: toSvgPath, ECL: ECL };
});
