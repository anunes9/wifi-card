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
  const [, setBulkOpen] = useState(false);
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
