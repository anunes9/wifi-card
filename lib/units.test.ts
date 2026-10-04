import { describe, expect, it } from 'vitest';
import { activeUnits, blank, hasContent, initialState, needsNetworkName, reducer } from './units';
import type { AppState, Plan, PlanItem, Unit, UnitData } from './types';

const data = (over: Partial<UnitData> = {}): UnitData => ({
  ref: '', ssid: '', pass: '', auth: 'WPA', hidden: false, ...over,
});
const unitWith = (id: string, over: Partial<UnitData> = {}): Unit => ({ id, ...data(over) });
const state = (units: Unit[]): AppState => ({ units, options: { showRef: true, showPayload: false, design: '1' } });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
