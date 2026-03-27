import { useRef, useEffect, useCallback, useState } from 'react';

/** Canvas view providing an HTML canvas element for drawing. */
export function CanvasView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Resize canvas to fit container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      // Fill with white background
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const getPos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDrawing(true);
    lastPos.current = getPos(e);
  }, [getPos]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || !lastPos.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#e8e0d8';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastPos.current = pos;
  }, [isDrawing, getPos]);

  const onMouseUp = useCallback(() => {
    setIsDrawing(false);
    lastPos.current = null;
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ display: 'block', cursor: 'crosshair' }}
      />
    </div>
  );
}
