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
    <div className="flex flex-col items-center gap-4 w-full">
      {word && (
        <div className="text-center">
          <span className="text-xl font-bangers tracking-widest text-[#FF69B4] bg-white border-[3px] border-black px-4 py-2 inline-block transform -rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" style={{ WebkitTextStroke: '0.5px black' }}>НАРИСУЙ</span>
          <p className="text-4xl font-bangers tracking-wide text-[#00BFFF] mt-2 drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>{word}</p>
        </div>
      )}

      {maxStrokes !== undefined && (
        <div className="flex items-center gap-2 text-lg font-black uppercase bg-white border-[3px] border-black px-4 py-2 transform rotate-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <span>КАСАНИЙ ОСТАЛОСЬ:</span>
          <span className={`text-2xl font-bangers tracking-widest ${remainingStrokes === 0 ? 'text-[#FF69B4]' : 'text-[#32CD32]'}`} style={{ WebkitTextStroke: '1px black' }}>
            {remainingStrokes}
          </span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="border-[6px] border-black bg-white touch-none cursor-crosshair shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1"
        style={{ width: '100%', maxWidth: '400px', aspectRatio: '1' }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />

      <div className="flex gap-3 flex-wrap justify-center mt-2">
        <button
          onClick={handleUndo}
          disabled={strokes.length === 0 || disabled}
          className="px-4 py-3 bg-white border-[4px] border-black text-lg font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform rotate-1"
        >
          ↩ ОТМЕНИТЬ
        </button>
        <button
          onClick={handleClear}
          disabled={strokes.length === 0 || disabled}
          className="px-4 py-3 bg-white border-[4px] border-black text-lg font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform -rotate-1"
        >
          🗑 ОЧИСТИТЬ
        </button>
        <button
          onClick={handleSubmit}
          disabled={disabled || strokes.length === 0}
          className="px-6 py-3 bg-[#32CD32] hover:bg-[#28a428] text-white border-[4px] border-black text-xl font-bangers tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform rotate-2"
          style={{ WebkitTextStroke: '1px black' }}
        >
          ✅ ОТПРАВИТЬ
        </button>
      </div>
    </div>
  );
}
