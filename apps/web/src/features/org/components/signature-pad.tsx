import { useEffect, useRef, useState } from 'react';
import { Button } from '@adoptafacil/ui';

/** `getContext('2d')` throws (rather than returning `null`) in some
 *  environments without a real canvas backend (e.g. jsdom in tests, some
 *  headless setups) — never let that take down the whole component. */
function getContext2D(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

export interface SignaturePadProps {
  /** Fired with a base64 PNG (no `data:` prefix) once the user has drawn
   *  something, or `null` once cleared/empty. */
  onChange: (base64: string | null) => void;
}

/**
 * Firma electrónica simple por trazo (S-1, RNF10) — dibujo libre en un
 * `<canvas>`, sin biometría ni firma digital certificada (fuera del alcance
 * del MVP). Pointer Events cubren mouse/touch/lápiz con un solo set de
 * handlers. No hay deshacer paso a paso — "Limpiar" reinicia el lienzo
 * completo, suficiente para una firma de un solo trazo/gesto.
 */
export function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = getContext2D(canvas);
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a1a1a';
  }, []);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    const ctx = canvas ? getContext2D(canvas) : null;
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const { x, y } = pointFromEvent(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas ? getContext2D(canvas) : null;
    if (!ctx) return;
    const { x, y } = pointFromEvent(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp(): void {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setHasStroke(true);
    emitCurrentDrawing();
  }

  function emitCurrentDrawing(): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] ?? null;
    onChange(base64);
  }

  function handleClear(): void {
    const canvas = canvasRef.current;
    const ctx = canvas ? getContext2D(canvas) : null;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        role="img"
        aria-label="Área para dibujar tu firma"
        className="w-full max-w-md touch-none rounded-md border border-input bg-background"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={!hasStroke}>
        Limpiar
      </Button>
    </div>
  );
}
