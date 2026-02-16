'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

type Point = { x: number; y: number };
type Stroke = Point[];

interface DrawCanvasProps {
  maxStrokes?: number;
  onSubmit: (dataUrl: string) => void;
  disabled?: boolean;
  word?: string;
}

export default function DrawCanvas({ maxStrokes, onSubmit, disabled, word }: DrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const CANVAS_SIZE = 500;
  const canDraw = !disabled && (maxStrokes === undefined || strokes.length < maxStrokes || isDrawing);
  const remainingStrokes = maxStrokes !== undefined
    ? Math.max(0, maxStrokes - strokes.length - (isDrawing ? 1 : 0))
    : undefined;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.strokeStyle = '#142a45';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allStrokes = [...strokes, ...(currentStroke.length > 0 ? [currentStroke] : [])];
    for (const stroke of allStrokes) {
      if (stroke.length < 2) {
        if (stroke.length === 1) {
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, 2, 0, Math.PI * 2);
          ctx.fillStyle = '#142a45';
          ctx.fill();
        }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
  }, [strokes, currentStroke]);

  useEffect(() => { redraw(); }, [redraw]);

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }, []);

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    if (maxStrokes !== undefined && strokes.length >= maxStrokes) return;
    e.preventDefault();
    setIsDrawing(true);
    setCurrentStroke([getPos(e)]);
  }, [disabled, maxStrokes, strokes.length, getPos]);

  const handleMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    setCurrentStroke(prev => [...prev, getPos(e)]);
  }, [isDrawing, disabled, getPos]);

  const handleEnd = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStroke.length > 0) {
      setStrokes(prev => [...prev, currentStroke]);
    }
    setCurrentStroke([]);
  }, [isDrawing, currentStroke]);

  const handleUndo = () => {
    setStrokes(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSubmit(canvas.toDataURL('image/png'));
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {word && (
        <div className="text-center">
          <span className="text-xs uppercase tracking-[0.3em] text-white/60">Нарисуй</span>
          <p className="text-2xl font-black text-white">{word}</p>
        </div>
      )}

      {maxStrokes !== undefined && (
        <div className="flex items-center gap-2 text-sm font-bold text-white/80">
          <span>Касаний осталось:</span>
          <span className={`text-lg ${remainingStrokes === 0 ? 'text-red-400' : 'text-green-400'}`}>
            {remainingStrokes}
          </span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="border-4 border-white/20 rounded-2xl bg-white touch-none cursor-crosshair"
        style={{ width: '100%', maxWidth: '400px', aspectRatio: '1' }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />

      <div className="flex gap-2 flex-wrap justify-center">
        <button
          onClick={handleUndo}
          disabled={strokes.length === 0 || disabled}
          className="px-4 py-2 rounded-xl border-2 border-white/20 bg-white/10 text-sm font-bold text-white disabled:opacity-40 active:scale-95 transition"
        >
          ↩ Отменить
        </button>
        <button
          onClick={handleClear}
          disabled={strokes.length === 0 || disabled}
          className="px-4 py-2 rounded-xl border-2 border-white/20 bg-white/10 text-sm font-bold text-white disabled:opacity-40 active:scale-95 transition"
        >
          🗑 Очистить
        </button>
        <button
          onClick={handleSubmit}
          disabled={disabled || strokes.length === 0}
          className="px-6 py-2 rounded-xl bg-green-500 text-white text-sm font-bold disabled:opacity-40 active:scale-95 transition"
        >
          ✅ Отправить
        </button>
      </div>
    </div>
  );
}
