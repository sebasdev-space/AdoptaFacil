export interface SampleQrProps {
  /** Tamaño en px del lado del QR. */
  size?: number;
}

// Patrón determinista 11×11 (incluye "ojos" en 3 esquinas) — DECORATIVO. No es un
// QR escaneable: es una MUESTRA visual para la maqueta (T-053), sin dependencias.
const CELLS = 11;
const FINDER = new Set<string>();
for (const [r0, c0] of [
  [0, 0],
  [0, CELLS - 3],
  [CELLS - 3, 0],
] as const) {
  for (let r = r0; r < r0 + 3; r += 1) {
    for (let c = c0; c < c0 + 3; c += 1) FINDER.add(`${r},${c}`);
  }
}
// Relleno pseudoaleatorio pero FIJO (sin Math.random) para un aspecto de QR estable.
function isFilled(r: number, c: number): boolean {
  if (FINDER.has(`${r},${c}`)) return true;
  return (r * 7 + c * 13 + r * c) % 3 === 0;
}

/**
 * QR de MUESTRA (§M05/RF14, maqueta T-053). SVG inline decorativo — deliberadamente
 * NO escaneable y sin librerías (preferimos imagen/SVG a añadir deps). En el RF14
 * real, este QR apuntará a la página pública de verificación con el código único.
 */
export function SampleQr({ size = 128 }: SampleQrProps) {
  const cells = [];
  for (let r = 0; r < CELLS; r += 1) {
    for (let c = 0; c < CELLS; c += 1) {
      if (isFilled(r, c)) {
        cells.push(<rect key={`${r},${c}`} x={c} y={r} width={1} height={1} />);
      }
    }
  }
  return (
    <svg
      role="img"
      aria-label="Código QR de muestra"
      data-testid="sample-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${CELLS} ${CELLS}`}
      shapeRendering="crispEdges"
      className="rounded-sm border border-border bg-white p-1 text-foreground"
    >
      <rect x={0} y={0} width={CELLS} height={CELLS} fill="white" />
      <g fill="currentColor">{cells}</g>
    </svg>
  );
}
