import type { Dispatch } from 'react';
import type { Action } from '@/lib/units';
import type { Design, Options as OptionsState } from '@/lib/types';

export default function Options({ options, dispatch }: { options: OptionsState; dispatch: Dispatch<Action> }) {
  const set = (patch: Partial<OptionsState>) => dispatch({ type: 'setOptions', patch });
  return (
    <div className="opts">
      <label><input type="checkbox" id="opt-ref" checked={options.showRef} onChange={(e) => set({ showRef: e.target.checked })} /> Print the unit reference on the card</label>
      <label><input type="checkbox" id="opt-payload" checked={options.showPayload} onChange={(e) => set({ showPayload: e.target.checked })} /> Show the QR payload (for debugging)</label>
      <label>Design <select id="opt-design" value={options.design} onChange={(e) => set({ design: e.target.value as Design })}>
        <option value="1">1 · Cream, plain</option>
        <option value="2">2 · Navy, speech bubble</option>
      </select></label>
    </div>
  );
}
