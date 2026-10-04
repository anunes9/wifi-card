import { toSvgPath, type QrCode } from '@/lib/qr';

export default function QrSvg({ qr, darkMm }: { qr: QrCode; darkMm: number }) {
  // darkMm is the printed size of the dark square itself. The svg is drawn
  // larger to hold the quiet zone, then pulled back by exactly that margin,
  // so the square lines up with the gutter whatever version the QR lands on.
  const p = toSvgPath(qr, 4);
  const box = ((darkMm * p.dim) / qr.size).toFixed(2);
  const bleed = ((darkMm * 4) / qr.size).toFixed(2);
  return (
    <svg
      className="c-qr"
      viewBox={`0 0 ${p.dim} ${p.dim}`}
      style={{ width: `${box}mm`, height: `${box}mm`, margin: `-${bleed}mm` }}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
    >
      <rect width={p.dim} height={p.dim} />
      <path d={p.path} />
    </svg>
  );
}
