import type { ReactNode } from 'react';
import type { UnitData } from '@/lib/types';

export interface CardProps {
  unit: UnitData;
  qr: ReactNode;
  unitRef: string; // empty when the reference is not printed
  payload: string | null; // null unless the debug payload is shown
}

export default function CardFields({ unit, payload }: { unit: UnitData; payload: string | null }) {
  return (
    <>
      <div className="c-field"><p className="c-label">Rede / Network</p><p className="c-value">{unit.ssid}</p></div>
      {unit.auth !== 'nopass' ? (
        <div className="c-field"><p className="c-label">Palavra-passe / Password</p><p className="c-value">{unit.pass}</p></div>
      ) : null}
      {payload !== null ? <div className="payload">{payload}</div> : null}
    </>
  );
}
