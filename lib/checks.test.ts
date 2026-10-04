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
    const w = checkAll([unit({ pass: 'x'.repeat(130) })]);
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
