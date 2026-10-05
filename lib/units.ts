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
