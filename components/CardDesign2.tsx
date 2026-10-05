import CardFields, { type CardProps } from './CardFields';

/* Navy, speech bubble: the credentials in a bubble over the Lisbon skyline,
   with the contacts bottom left and the wordmark under the tail, bottom right. */
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
        <p className="c-contact-name">Lisbeyond</p>
        <p className="c-contact-tel">+351 210 924 102</p>
      </div>
      <div className="c-logo"><img src="/img/logo.png" alt="Lisbeyond" /></div>
      {unitRef ? <p className="c-ref">{unitRef}</p> : null}
    </div>
  );
}
