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
