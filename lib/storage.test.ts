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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
