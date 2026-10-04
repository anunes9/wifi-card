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
