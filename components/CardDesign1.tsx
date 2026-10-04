import CardFields, { type CardProps } from './CardFields';

/* Cream, plain: the code, the two credentials, the wordmark. */
export default function CardDesign1({ unit, qr, unitRef, payload }: CardProps) {
  return (
    <div className="c-frame">
      <div className="c-main">
        <div className="c-qrbox">
          <div className="c-qrwrap">
            {qr}
            <div className="c-under">
              <p className="c-scan">Aponte a câmara do telemóvel<span className="en">Point your phone camera</span></p>
              {unitRef ? <p className="c-ref">{unitRef}</p> : null}
            </div>
          </div>
        </div>
        <div className="c-body">
          <p className="c-title">Wi-Fi</p>
          <CardFields unit={unit} payload={payload} />
        </div>
      </div>
      <div className="c-foot">
        <img className="c-mark" src="/img/logo.png" alt="Lisbeyond" />
      </div>
    </div>
  );
}
