import { useRef, useEffect, useCallback, useState } from 'react';

interface CanvasShape {
  id: string;
  type: 'rect' | 'circle' | 'ellipse' | 'line' | 'path' | 'text';
  props: Record<string, string | number>;
  style?: Record<string, string>;
  ai_generated?: boolean;
}

type Tool = 'pen' | 'rect' | 'circle' | 'line' | 'text' | 'select';

const COLORS = ['#e8e0d8', '#7eb8ff', '#4ade80', '#f87171', '#fbbf24', '#a78bfa', '#f472b6', '#000000'];

interface CanvasViewProps {
  content?: string;
  onChange?: (content: string) => void;
}

export function CanvasView({ content, onChange }: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('pen');
  const [activeColor, setActiveColor] = useState('#e8e0d8');
  const [brushSize, setBrushSize] = useState(2);
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const drawStartPos = useRef<{ x: number; y: number } | null>(null);
  const [previewShape, setPreviewShape] = useState<CanvasShape | null>(null);

  // Parse content for AI-generated shapes
  useEffect(() => {
    if (!content) return;
    try {
      const data = JSON.parse(content);
      if (data.shapes && Array.isArray(data.shapes)) {
        setShapes(data.shapes);
      }
    } catch {
      // Not JSON, ignore
    }
  }, [content]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      // Save current drawing
      const ctx = canvas.getContext('2d');
      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = rect.width;
      canvas.height = rect.height;
      // Fill background
      if (ctx) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Restore drawing if dimensions match
        if (imageData && imageData.width === canvas.width && imageData.height === canvas.height) {
          ctx.putImageData(imageData, 0, 0);
        }
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

  const saveUndoState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    setUndoStack(prev => [...prev.slice(-19), dataUrl]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = last;
  }, [undoStack]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    saveUndoState();
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setShapes([]);
  }, [saveUndoState]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getPos(e);
    if (activeTool === 'pen') {
      saveUndoState();
      setIsDrawing(true);
      lastPos.current = pos;
    } else if (['rect', 'circle', 'line'].includes(activeTool)) {
      drawStartPos.current = pos;
      setIsDrawing(true);
    }
  }, [getPos, activeTool, saveUndoState]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;
    const pos = getPos(e);

    if (activeTool === 'pen' && lastPos.current) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      lastPos.current = pos;
    } else if (drawStartPos.current && ['rect', 'circle', 'line'].includes(activeTool)) {
      const start = drawStartPos.current;
      let shape: CanvasShape | null = null;
      if (activeTool === 'rect') {
        shape = {
          id: 'preview',
          type: 'rect',
          props: { x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y), width: Math.abs(pos.x - start.x), height: Math.abs(pos.y - start.y) },
          style: { stroke: activeColor, strokeWidth: String(brushSize), fill: 'none' },
        };
      } else if (activeTool === 'circle') {
        const r = Math.sqrt(Math.pow(pos.x - start.x, 2) + Math.pow(pos.y - start.y, 2));
        shape = {
          id: 'preview',
          type: 'circle',
          props: { cx: start.x, cy: start.y, r },
          style: { stroke: activeColor, strokeWidth: String(brushSize), fill: 'none' },
        };
      } else if (activeTool === 'line') {
        shape = {
          id: 'preview',
          type: 'line',
          props: { x1: start.x, y1: start.y, x2: pos.x, y2: pos.y },
          style: { stroke: activeColor, strokeWidth: String(brushSize) },
        };
      }
      setPreviewShape(shape);
    }
  }, [isDrawing, getPos, activeTool, activeColor, brushSize]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDrawing && drawStartPos.current && ['rect', 'circle', 'line'].includes(activeTool)) {
      const pos = getPos(e);
      const start = drawStartPos.current;
      let newShape: CanvasShape | null = null;
      const shapeId = `shape-${Date.now()}`;

      if (activeTool === 'rect') {
        newShape = {
          id: shapeId, type: 'rect',
          props: { x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y), width: Math.abs(pos.x - start.x), height: Math.abs(pos.y - start.y) },
          style: { stroke: activeColor, strokeWidth: String(brushSize), fill: 'none' },
        };
      } else if (activeTool === 'circle') {
        const r = Math.sqrt(Math.pow(pos.x - start.x, 2) + Math.pow(pos.y - start.y, 2));
        newShape = {
          id: shapeId, type: 'circle',
          props: { cx: start.x, cy: start.y, r },
          style: { stroke: activeColor, strokeWidth: String(brushSize), fill: 'none' },
        };
      } else if (activeTool === 'line') {
        newShape = {
          id: shapeId, type: 'line',
          props: { x1: start.x, y1: start.y, x2: pos.x, y2: pos.y },
          style: { stroke: activeColor, strokeWidth: String(brushSize) },
        };
      }

      if (newShape) {
        const updated = [...shapes, newShape];
        setShapes(updated);
        onChange?.(JSON.stringify({ shapes: updated }));
      }
      setPreviewShape(null);
    }
    setIsDrawing(false);
    lastPos.current = null;
    drawStartPos.current = null;
  }, [isDrawing, activeTool, getPos, activeColor, brushSize, shapes, onChange]);

  const renderSvgShape = (shape: CanvasShape) => {
    const style = shape.style || {};
    const svgStyle: React.CSSProperties = {};
    if (style.stroke) svgStyle.stroke = style.stroke;
    if (style.strokeWidth) svgStyle.strokeWidth = Number(style.strokeWidth);
    if (style.fill) svgStyle.fill = style.fill;
    else svgStyle.fill = 'none';
    if (shape.ai_generated) {
      svgStyle.filter = 'drop-shadow(0 0 4px rgba(126, 184, 255, 0.3))';
    }

    const p = shape.props;
    switch (shape.type) {
      case 'rect': return <rect key={shape.id} x={p.x} y={p.y} width={p.width} height={p.height} style={svgStyle} />;
      case 'circle': return <circle key={shape.id} cx={p.cx} cy={p.cy} r={p.r} style={svgStyle} />;
      case 'ellipse': return <ellipse key={shape.id} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} style={svgStyle} />;
      case 'line': return <line key={shape.id} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} style={svgStyle} />;
      case 'path': return <path key={shape.id} d={String(p.d)} style={svgStyle} />;
      case 'text': return <text key={shape.id} x={p.x} y={p.y} style={{ ...svgStyle, fill: style.fill || '#e8e0d8', fontSize: p.fontSize || 16 }}>{String(p.text || '')}</text>;
      default: return null;
    }
  };

  const toolButtons: { tool: Tool; label: string; icon: string }[] = [
    { tool: 'pen', label: 'Pen', icon: '\u270f\ufe0f' },
    { tool: 'rect', label: 'Rectangle', icon: '\u25a2' },
    { tool: 'circle', label: 'Circle', icon: '\u25cb' },
    { tool: 'line', label: 'Line', icon: '\u2571' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1a1a1a' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Tool buttons */}
        {toolButtons.map(({ tool, label, icon }) => (
          <button
            key={tool}
            onClick={() => setActiveTool(tool)}
            title={label}
            style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: activeTool === tool ? 'rgba(126, 184, 255, 0.2)' : 'transparent',
              color: activeTool === tool ? '#7eb8ff' : '#999',
              fontSize: 14, fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {icon}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Color palette */}
        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => setActiveColor(color)}
            style={{
              width: 18, height: 18, borderRadius: '50%', border: activeColor === color ? '2px solid #7eb8ff' : '2px solid transparent',
              background: color, cursor: 'pointer', padding: 0, flexShrink: 0,
            }}
          />
        ))}

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Brush size */}
        <input
          type="range" min={1} max={12} value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          style={{ width: 60, accentColor: '#7eb8ff' }}
          title={`Brush size: ${brushSize}`}
        />

        <div style={{ flex: 1 }} />

        {/* Actions */}
        <button onClick={handleUndo} title="Undo" style={{
          padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent',
          color: undoStack.length > 0 ? '#999' : '#444', cursor: undoStack.length > 0 ? 'pointer' : 'default',
          fontSize: 13, fontFamily: 'inherit',
        }}>Undo</button>
        <button onClick={handleClear} title="Clear" style={{
          padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent',
          color: '#999', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
        }}>Clear</button>
      </div>

      {/* Canvas + SVG overlay */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            display: 'block', width: '100%', height: '100%',
            cursor: 'crosshair',
          }}
        />
        {/* SVG overlay for shapes */}
        <svg
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none',
          }}
        >
          {shapes.map(renderSvgShape)}
          {previewShape && renderSvgShape(previewShape)}
        </svg>
      </div>
    </div>
  );
}
