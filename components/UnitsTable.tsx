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
