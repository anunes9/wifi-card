import { encode, wifiPayload, type QrCode } from '@/lib/qr';
import type { Options, Unit } from '@/lib/types';
import CardDesign1 from './CardDesign1';
import CardDesign2 from './CardDesign2';
import QrSvg from './QrSvg';

// Printed size of the QR's dark square, per design.
const DARK_MM = { '1': 58, '2': 40 } as const;

/* One A5 card per active unit, two to an A4 sheet; every second card carries
   the dashed cut line along its top. */
export default function Sheet({ units, options }: { units: Unit[]; options: Options }) {
  return (
    <div className="sheet" id="sheet">
      {units.length ? (
        units.map((u, i) => <Card key={u.id} unit={u} index={i} options={options} />)
      ) : (
        <div className="card">
          <p className="c-empty">Add a unit with a network name to see its card here.</p>
        </div>
      )}
    </div>
  );
}

function Card({ unit: u, index, options }: { unit: Unit; index: number; options: Options }) {
  const payload = wifiPayload({ ssid: u.ssid, password: u.pass, auth: u.auth, hidden: u.hidden });
  let code: QrCode | null = null;
  let error = '';
  try {
    code = encode(payload, { ecl: 'Q' });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const qr = code ? <QrSvg qr={code} darkMm={DARK_MM[options.design]} /> : <p className="c-empty">{error}</p>;
  const props = {
    unit: u,
    qr,
    unitRef: options.showRef ? u.ref : '',
    payload: options.showPayload ? payload : null,
  };
  const d2 = options.design === '2';
  return (
    <div className={'card' + (index % 2 === 1 ? ' cut-top' : '') + (d2 ? ' d2' : '')}>
      {d2 ? <CardDesign2 {...props} /> : <CardDesign1 {...props} />}
    </div>
  );
}
