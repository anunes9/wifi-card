import { checkAll } from '@/lib/checks';
import type { UnitData } from '@/lib/types';

export default function Warnings({ units }: { units: UnitData[] }) {
  return (
    <ul className="warn-list" id="warnings">
      {checkAll(units).map((w, i) => (
        <li key={i} className={w.err ? 'err' : undefined}>{w.msg}</li>
      ))}
    </ul>
  );
}
