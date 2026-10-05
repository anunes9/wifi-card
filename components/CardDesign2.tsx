import CardFields, { type CardProps } from './CardFields';

/* Navy, speech bubble: the credentials in a bubble over the Lisbon skyline,
   with the contacts bottom left and the wordmark under the skyline's seagull. */
export default function CardDesign2({ unit, qr, unitRef, payload }: CardProps) {
  return (
    <div className="c-frame">
      <img className="c-sky" src="/img/skyline.png" alt="" />
      <div className="c-bubble">
        <p className="c-say">Aponte a câmara do telemóvel.</p>
        <p className="c-say2">Point your phone camera.</p>
        <div className="c-row">
          <div className="c-qrbox">{qr}</div>
          <div className="c-body">
            <CardFields unit={unit} payload={payload} />
          </div>
        </div>
        <div className="c-tail"></div>
      </div>
      <div className="c-contact">
        <p className="c-contact-say">Se precisar de alguma coisa, <span className="ln">contacte<span className="hy">-</span>nos.</span></p>
        <p className="c-contact-say2">If you need anything, contact us.</p>
        <p className="c-contact-tel">+351 210 924 102</p>
        <p className="c-contact-tel">info@lisbeyond.com</p>
      </div>
      <img className="c-wordmark" src="/img/wordmark.png" alt="Lisbeyond" />
      {unitRef ? <p className="c-ref">{unitRef}</p> : null}
    </div>
  );
}
