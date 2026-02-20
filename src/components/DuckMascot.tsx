// src/components/DuckMascot.tsx
// Интерактивная утка-маскот: голова/глаза следят за курсором, клик — взмах крыльев + кряк
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

const DUCK_SOUND_COUNT = 7; // /audio/duck/1.mp3 … 7.mp3
const FLAP_DURATION_MS = 750;

export function DuckMascot({ size = 148 }: { size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [headAngle, setHeadAngle] = useState(0);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const [flapping, setFlapping] = useState(false);
  const flapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Mouse tracking ── */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      // Head rotates ±20° toward cursor (horizontal only)
      setHeadAngle(Math.max(-20, Math.min(20, dx * 0.13)));

      // Pupils follow cursor, clamped to 4px radius
      const dist = Math.hypot(dx, dy) || 1;
      const scale = Math.min(4, dist * 0.06);
      setPupil({ x: (dx / dist) * scale, y: (dy / dist) * scale });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  /* ── Click: flap + quack ── */
  const handleClick = useCallback(() => {
    if (flapping) return;
    setFlapping(true);
    if (flapTimerRef.current) clearTimeout(flapTimerRef.current);
    flapTimerRef.current = setTimeout(() => setFlapping(false), FLAP_DURATION_MS);

    const idx = Math.floor(Math.random() * DUCK_SOUND_COUNT) + 1;
    const audio = new Audio(`/audio/duck/${idx}.mp3`);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  }, [flapping]);

  return (
    <>
      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes _duckWIngL {
          0%   { transform: rotate(8deg); }
          22%  { transform: rotate(-58deg) translateX(-3px); }
          50%  { transform: rotate(22deg); }
          75%  { transform: rotate(-32deg) translateX(-2px); }
          100% { transform: rotate(8deg); }
        }
        @keyframes _duckWIngR {
          0%   { transform: rotate(-8deg); }
          22%  { transform: rotate(58deg) translateX(3px); }
          50%  { transform: rotate(-22deg); }
          75%  { transform: rotate(32deg) translateX(2px); }
          100% { transform: rotate(-8deg); }
        }
        ._dwL { transform-box: fill-box; transform-origin: 90% 40%; }
        ._dwR { transform-box: fill-box; transform-origin: 10% 40%; }
        ._dwL._flap { animation: _duckWIngL ${FLAP_DURATION_MS}ms ease-in-out forwards; }
        ._dwR._flap { animation: _duckWIngR ${FLAP_DURATION_MS}ms ease-in-out forwards; }
        ._duckCircle { transition: box-shadow 0.15s ease; }
        ._duckCircle:hover { box-shadow: 0 0 0 5px #ffd70066, 0 8px 32px #ffd70055; }
        ._duckCircle:active { transform: scale(0.94); }
      `}</style>

      <div
        ref={containerRef}
        onClick={handleClick}
        title="Кликни на утку! 🦆"
        className="relative mx-auto cursor-pointer select-none"
        style={{ width: size, height: size }}
      >
        <div
          className="_duckCircle absolute inset-0 rounded-full border-[4px] border-[#142a45] overflow-hidden"
          style={{ background: 'radial-gradient(circle at 40% 35%, #e0f7fa 0%, #b2ebf2 100%)' }}
        >
          <svg viewBox="0 0 172 172" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
            {/* ── Water ripple (decoration) ── */}
            <ellipse cx="86" cy="148" rx="42" ry="8" fill="#4dd0e1" opacity="0.22" />
            <ellipse cx="86" cy="148" rx="28" ry="5" fill="#00bcd4" opacity="0.18" />

            {/* ── Left wing ── */}
            <ellipse
              cx="56" cy="108" rx="28" ry="14"
              fill="#f9a825"
              stroke="#e65100" strokeWidth="1.2"
              className={`_dwL${flapping ? ' _flap' : ''}`}
            />
            {/* ── Right wing ── */}
            <ellipse
              cx="116" cy="108" rx="28" ry="14"
              fill="#f9a825"
              stroke="#e65100" strokeWidth="1.2"
              className={`_dwR${flapping ? ' _flap' : ''}`}
            />

            {/* ── Body ── */}
            <ellipse cx="86" cy="116" rx="34" ry="29" fill="#fdd835" stroke="#f9a825" strokeWidth="1.5" />
            {/* Belly */}
            <ellipse cx="86" cy="120" rx="19" ry="16" fill="#fff9c4" opacity="0.9" />

            {/* ── Feet ── */}
            <ellipse cx="72" cy="142" rx="14" ry="5.5" fill="#ff8f00" transform="rotate(-14, 72, 142)" />
            <ellipse cx="100" cy="142" rx="14" ry="5.5" fill="#ff8f00" transform="rotate(14, 100, 142)" />

            {/* ── Head (rotates toward cursor) ── */}
            <g
              style={{
                transform: `rotate(${headAngle}deg)`,
                transformBox: 'fill-box' as React.CSSProperties['transformBox'],
                transformOrigin: '50% 90%',
                transition: 'transform 0.12s ease',
              }}
            >
              {/* Head base */}
              <circle cx="86" cy="72" r="27" fill="#fdd835" stroke="#f9a825" strokeWidth="1.5" />

              {/* Cheeks */}
              <circle cx="70" cy="80" r="8" fill="#f06292" opacity="0.45" />
              <circle cx="102" cy="80" r="8" fill="#f06292" opacity="0.45" />

              {/* Bill — upper */}
              <ellipse cx="86" cy="91" rx="14" ry="9" fill="#ff8f00" />
              {/* Bill — lower (lighter) */}
              <ellipse cx="86" cy="87" rx="12" ry="6" fill="#ffb300" />
              {/* Bill line */}
              <path d="M74 90 Q86 95 98 90" stroke="#e65100" strokeWidth="1.2" fill="none" />
              {/* Nostrils */}
              <circle cx="80" cy="84" r="1.6" fill="#bf360c" opacity="0.55" />
              <circle cx="92" cy="84" r="1.6" fill="#bf360c" opacity="0.55" />

              {/* Eye whites */}
              <circle cx="73" cy="65" r="10" fill="white" stroke="#e0e0e0" strokeWidth="0.5" />
              <circle cx="99" cy="65" r="10" fill="white" stroke="#e0e0e0" strokeWidth="0.5" />

              {/* Pupils (move with cursor) */}
              <circle cx={73 + pupil.x} cy={65 + pupil.y} r="5.5" fill="#1a237e" />
              <circle cx={99 + pupil.x} cy={65 + pupil.y} r="5.5" fill="#1a237e" />

              {/* Eye inner gloss */}
              <circle cx={75.5 + pupil.x} cy={62.5 + pupil.y} r="2" fill="white" />
              <circle cx={101.5 + pupil.x} cy={62.5 + pupil.y} r="2" fill="white" />

              {/* Eyelash top-left */}
              <line x1="65" y1="57" x2="62" y2="52" stroke="#142a45" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="70" y1="55" x2="68" y2="50" stroke="#142a45" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="75" y1="55" x2="74" y2="49" stroke="#142a45" strokeWidth="1.4" strokeLinecap="round" />

              {/* Eyelash top-right */}
              <line x1="107" y1="57" x2="110" y2="52" stroke="#142a45" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="102" y1="55" x2="104" y2="50" stroke="#142a45" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="97" y1="55" x2="98" y2="49" stroke="#142a45" strokeWidth="1.4" strokeLinecap="round" />
            </g>

            {/* Sparkle on click */}
            {flapping && (
              <>
                <circle cx="40" cy="55" r="4" fill="#ffe082" opacity="0.9">
                  <animate attributeName="opacity" from="0.9" to="0" dur="0.6s" fill="freeze" />
                  <animate attributeName="r" from="4" to="14" dur="0.6s" fill="freeze" />
                </circle>
                <circle cx="135" cy="50" r="4" fill="#80deea" opacity="0.9">
                  <animate attributeName="opacity" from="0.9" to="0" dur="0.55s" fill="freeze" />
                  <animate attributeName="r" from="4" to="13" dur="0.55s" fill="freeze" />
                </circle>
                <text x="86" y="36" textAnchor="middle" fontSize="16" style={{ userSelect: 'none' }}>
                  ✨
                  <animate attributeName="y" from="36" to="20" dur="0.65s" fill="freeze" />
                  <animate attributeName="opacity" from="1" to="0" dur="0.65s" fill="freeze" />
                </text>
              </>
            )}
          </svg>
        </div>
      </div>
    </>
  );
}
