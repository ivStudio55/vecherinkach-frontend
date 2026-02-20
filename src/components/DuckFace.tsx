// src/components/DuckFace.tsx
// Подозрительная утка в стиле Perry — SVG с интерактивным отслеживанием курсора
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

const DUCK_SOUND_COUNT = 7;
const BLINK_MIN_MS = 3000;
const BLINK_MAX_MS = 5000;

export function DuckFace({ size = 140 }: { size?: number }) {
  const containerRef = useRef<SVGSVGElement>(null);
  /* side: -1 = cursor left, +1 = cursor right, 0 = center */
  const [side, setSide] = useState(0);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const [blinking, setBlinking] = useState(false);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Mouse tracking ── */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const svg = containerRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      setSide(dx < -8 ? -1 : dx > 8 ? 1 : 0);

      // Зрачки: max 35% радиуса глаза
      const dist = Math.hypot(dx, dy) || 1;
      const maxShift = 5;
      const scale = Math.min(maxShift, dist * 0.04);
      setPupil({ x: (dx / dist) * scale, y: (dy / dist) * scale });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  /* ── Blink loop ── */
  const scheduleBlink = useCallback(() => {
    const delay = BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
    blinkTimerRef.current = setTimeout(() => {
      setBlinking(true);
      setTimeout(() => {
        setBlinking(false);
        scheduleBlink();
      }, 150);
    }, delay);
  }, []);

  useEffect(() => {
    scheduleBlink();
    return () => { if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current); };
  }, [scheduleBlink]);

  /* ── Click: quick blink + quack ── */
  const handleClick = useCallback(() => {
    setBlinking(true);
    setTimeout(() => setBlinking(false), 120);

    const idx = Math.floor(Math.random() * DUCK_SOUND_COUNT) + 1;
    const audio = new Audio(`/audio/duck/${idx}.mp3`);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  }, []);

  /* ── Derived values ── */
  // Eye scales: the eye nearest cursor grows, the other shrinks
  const leftEyeScale  = side === -1 ? 1.25 : side === 1 ? 0.55 : 1;
  const rightEyeScale = side === 1  ? 1.25 : side === -1 ? 0.55 : 1;

  // Brow arcs: the brow on the opposite side of cursor is raised (surprised)
  // side=-1 → right brow raised;  side=+1 → left brow raised
  const leftBrowY  = side === 1  ? -6 : side === -1 ? 4 : 0;
  const rightBrowY = side === -1 ? -6 : side === 1  ? 4 : 0;
  const leftBrowCurve  = side === 1  ? -8 : side === -1 ? 2 : -3;
  const rightBrowCurve = side === -1 ? -8 : side === 1  ? 2 : -3;

  const blinkScaleY = blinking ? 0.08 : 1;

  const t = '0.22s ease';

  return (
    <div
      className="relative mx-auto cursor-pointer select-none"
      style={{ width: size, height: size }}
      title="Кликни! 🦆"
    >
      <div
        className="absolute inset-0 rounded-full border-[4px] border-[#142a45] overflow-hidden"
        style={{ background: '#00bfa5' }}
      >
        <svg
          ref={containerRef}
          viewBox="0 0 200 200"
          width={size}
          height={size}
          xmlns="http://www.w3.org/2000/svg"
          onClick={handleClick}
        >
          {/* ── Left eye ── */}
          <g
            style={{
              transform: `scale(${leftEyeScale})`,
              transformOrigin: '72px 98px',
              transition: `transform ${t}`,
            }}
          >
            {/* White */}
            <ellipse
              cx="72" cy="98" rx="24" ry="16"
              fill="#fff" stroke="#1a1a1a" strokeWidth="3.5"
              style={{
                transform: `scaleY(${blinkScaleY})`,
                transformOrigin: '72px 98px',
                transition: `transform 0.09s ease`,
              }}
            />
            {/* Pupil */}
            {!blinking && (
              <ellipse
                cx={72 + pupil.x} cy={98 + pupil.y}
                rx="9" ry="11"
                fill="#5D4037"
                style={{ transition: `cx ${t}, cy ${t}` }}
              />
            )}
          </g>

          {/* ── Right eye ── */}
          <g
            style={{
              transform: `scale(${rightEyeScale})`,
              transformOrigin: '128px 98px',
              transition: `transform ${t}`,
            }}
          >
            <ellipse
              cx="128" cy="98" rx="24" ry="16"
              fill="#fff" stroke="#1a1a1a" strokeWidth="3.5"
              style={{
                transform: `scaleY(${blinkScaleY})`,
                transformOrigin: '128px 98px',
                transition: `transform 0.09s ease`,
              }}
            />
            {!blinking && (
              <ellipse
                cx={128 + pupil.x} cy={98 + pupil.y}
                rx="9" ry="11"
                fill="#5D4037"
                style={{ transition: `cx ${t}, cy ${t}` }}
              />
            )}
          </g>

          {/* ── Left brow ── */}
          <path
            d={`M 52 ${78 + leftBrowY} Q 72 ${70 + leftBrowY + leftBrowCurve} 90 ${80 + leftBrowY}`}
            stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" fill="none"
            style={{ transition: `d ${t}` }}
          />

          {/* ── Right brow ── */}
          <path
            d={`M 110 ${80 + rightBrowY} Q 128 ${70 + rightBrowY + rightBrowCurve} 148 ${78 + rightBrowY}`}
            stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" fill="none"
            style={{ transition: `d ${t}` }}
          />

          {/* ── Bill (клюв) ── */}
          <ellipse cx="100" cy="126" rx="42" ry="14"
            fill="#FFA726" stroke="#E65100" strokeWidth="2.5"
          />
          {/* Линия рта */}
          <path d="M 62 126 Q 100 134 138 126" stroke="#BF360C" strokeWidth="2" fill="none" />
          {/* Ноздри */}
          <circle cx="90" cy="123" r="2.2" fill="#BF360C" opacity="0.5" />
          <circle cx="110" cy="123" r="2.2" fill="#BF360C" opacity="0.5" />
        </svg>
      </div>
      <style>{`
        ._dfHover:hover { box-shadow: 0 0 0 5px #ffd70066, 0 8px 32px #ffd70055; }
        ._dfHover:active { transform: scale(0.94); }
      `}</style>
    </div>
  );
}
