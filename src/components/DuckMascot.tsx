// src/components/DuckMascot.tsx
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';

const DUCK_SOUND_COUNT = 7;
const FLAP_DURATION_MS = 750;
const BLINK_MIN_MS = 3000;
const BLINK_MAX_MS = 6000;

export function DuckMascot({ size = 148 }: { size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ dx: 0, dy: 0, dist: 0 });
  const [flapping, setFlapping] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const flapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const dist = Math.hypot(dx, dy);
      setMousePos({ dx, dy, dist });
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
        if (Math.random() > 0.7) {
          setTimeout(() => {
            setBlinking(true);
            setTimeout(() => {
              setBlinking(false);
              scheduleBlink();
            }, 120);
          }, 100);
        } else {
          scheduleBlink();
        }
      }, 120);
    }, delay);
  }, []);

  useEffect(() => {
    scheduleBlink();
    return () => { if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current); };
  }, [scheduleBlink]);

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

  /* ── Derived values ── */
  const { dx, dy, dist } = mousePos;
  
  // Head rotation and parallax
  const headAngle = Math.max(-25, Math.min(25, dx * 0.15));
  const headX = dist > 0 ? (dx / dist) * Math.min(4, dist * 0.01) : 0;
  const headY = dist > 0 ? (dy / dist) * Math.min(4, dist * 0.01) : 0;

  // Smooth pupil movement
  const maxShift = 6;
  const pupilScale = Math.min(maxShift, dist * 0.05);
  const px = dist > 0 ? (dx / dist) * pupilScale : 0;
  const py = dist > 0 ? (dx / dist) * pupilScale : 0;

  const blinkScaleY = blinking ? 0.1 : 1;

  const [hovered, setHovered] = useState(false);
  const tFast = '0.15s cubic-bezier(0.4, 0, 0.2, 1)';
  const tSmooth = '0.4s cubic-bezier(0.25, 1, 0.5, 1)';

  const ringStyle: CSSProperties = {
    boxShadow: hovered
      ? '0 0 0 6px #142a4522, 0 12px 36px -6px #142a4544'
      : '0 0 0 0px transparent',
    transition: 'box-shadow 0.3s ease, transform 0.2s ease',
    transform: hovered ? 'scale(1.02)' : 'scale(1)',
  };

  return (
    <>
      <style>{`
        @keyframes _duckWIngL {
          0%   { transform: rotate)8deg); }
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
        @keyframes _duckBodyBop {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        ._dwL { transform-box: fill-box; transform-origin: 90% 40%; }
        ._dwR { transform-box: fill-box; transform-origin: 10% 40%; }
        ._dwL._flap { animation: _duckWIngL ${FLAP_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        ._dwR._flap { animation: _duckWIngR ${FLAP_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        ._dBody._flap { animation: _duckBodyBop ${FLAP_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }
      `}</style>

      <div
        ref={containerRef}
        onClick={handleClick}
        title="Кликни на утку! 🦄"
        className="relative mx-auto cursor-pointer select-none"
        style={{ width: size, height: size }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="absolute inset-0 rounded-full border-[4px] border-[#142a45] overflow-hidden bg-white"
          style={ringStyle}
        >
          <svg viewBox="0 0 172 172" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            {/* ── Water ripple (decoration) ── */}
            <g style={{ transform: hovered ? 'scale(1.05)' : 'scale(1)', transformOrigin: '86px 148px', transition: tSmooth }}>
              <ellipse cx="86" cy="148" rx="42" ry="8" fill="#4dd0e1" opacity="0.22" />
              <ellipse cx="86" cy="148" rx="28" ry="5" fill="#00bcd4" opacity="0.18" />
            </g>

            <g className={`_dBody${flapping ? ' _flap' : ''}`}>
              {/* ── Left wing ── */}
              <ellipse
                cx="56" cy="108" rx="28" ry="14"
                fill="#FBC02D"
                stroke="#F57F17" strokeWidth="2"
                className={`_dwL${flapping ? ' _flap' : ''}`}
              />
              {/* ── Right wing ── */}
              <ellipse
                cx="116" cy="108" rx="28" ry="14"
                fill="#FBC02D"
                stroke="#F57F17" strokeWidth="2"
                className={`_dwR${flapping ? ' _flap' : ''}`}
              />

              {/* ── Body ── */}
              <path d="M 52 116 C 52 80, 120 80, 120 116 C 120 145, 52 145, 52 116 Z" fill="#FFD54F" stroke="#FBC02D" strokeWidth="2.5" />
              {/* Belly */}
              <path d="M 67 120 C 67 100, 105 100, 105 120 C 105 135, 67 135, 67 120 Z" fill="#FFF9C4" opacity="0.9" />

              {/* ── Feet ── */}
              <path d="M 65 138 Q 72 148 60 145 Q 75 150 78 140 Z" fill="#FF8F00" />
              <path d="M 107 138 Q 100 148 112 145 Q 97 150 94 140 Z" fill="#FF8F00" />

              {/* ── Head (rotates toward cursor) ── */}
              <g
                style={{
                  transform: `translate(${headX}px, ${headY}px) rotate(${headAngle}deg)`,
                  transformOrigin: '86px 95px',
                  transition: `transform ${tSmooth}`,
                }}
              >
                {/* Head base */}
                <circle cx="86" cy="72" r="28" fill="#FFD54F" stroke="#FBC02D" strokeWidth="2.5" />

                {/* Hair Tuft */}
                <g stroke="#FBC02D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M 86 44 Q 80 30 75 35 Q 82 42 86 44 Z" fill="#FFD54F" />
                  <path d="M 88 42 Q 90 25 95 30 Q 92 40 88 42 Z" fill="#FFD54F" />
                </g>

                {/* Cheeks */}
                <ellipse cx="68" cy="82" rx="7" ry="4.5" fill="#FF8A65" opacity="0.55" />
                <ellipse cx="104" cy="82" rx="7" ry="4.5" fill="#FF8A65" opacity="0.55" />

                {/* Bill — upper */}
                <path d="M 72 91 Q 86 85 100 91 Q 105 98 86 102 Q 67 98 72 91 Z" fill="#FF9800" stroke="#E65100" strokeWidth="1.5" strokeLinejoin="round" />
                {/* Bill — lower */}
                <path d="M 76 98 Q 86 108 96 98 Z" fill="#F57C00" />
                {/* Bill line */}
                <path d="M 74 94 Q 86 98 98 94" stroke="#FFB74D" strokeWidth="2" strokeLinecap="round" fill="none" />
                {/* Nostrils */}
                <ellipse cx="81" cy="89" rx="1.5" ry="2.5" fill="#E65100" opacity="0.7" transform="rotate(-15 81 89)" />
                <ellipse cx="91" cy="89" rx="1.5" ry="2.5" fill="#E65100" opacity="0.7" transform="rotate(15 91 89)" />

                {/* Left Eye */}
                <g
                  style={{
                    transform: `scaleY(${blinkScaleY})`,
                    transformOrigin: '73px 65px',
                    transition: `transform ${blinking ? tFast : tSmooth}`,
                  }}
                >
                  <circle cx="73" cy="65" r="11" fill="#FFFFFF" stroke="#3E2723" strokeWidth="2" />
                  <g style={{ transform: `translate(${px}px, ${py}px)`, transition: `transform ${tFast}` }}>
                    <circle cx="73" cy="65" r="6" fill="#3E2723" />
                    <circle cx="71" cy="62" r="2" fill="#FFFFFF" />
                    <circle cx="75.5" cy="67.5" r="1" fill="#FFFFFF" />
                  </g>
                </g>

                {/* Right Eye */}
                <g
                  style={{
                    transform: `scaleY(${blinkScaleY})`,
                    transformOrigin: '99px 65px',
                    transition: `transform ${blinking ? tFast : tSmooth}`,
                  }}
                >
                  <circle cx="99" cy="65" r="11" fill="#FFFFFF" stroke="#3E2723" strokeWidth="2" />
                  <g style={{ transform: `translate(${px}px, ${py}px)`, transition: `transform ${tFast}` }}>
                    <circle cx="99" cy="65" r="6" fill="#3E2723" />
                    <circle cx="97" cy="62" r="2" fill="#FFFFFF" />
                    <circle cx="101.5" cy="67.5" r="1" fill="#FFFFFF" />
                  </g>
                </g>

                {/* Eyelashes */}
                <g stroke="#3E2723" strokeWidth="2" strokeLinecap="round">
                  <line x1="64" y1="56" x2="60" y2="50" />
                  <line x1="69" y1="54" x2="67" y2="48" />
                  <line x1="108" y1="56" x2="112" y2="50" />
                  <line x1="103" y1="54" x2="105" y2="48" />
                </g>
              </g>
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
                  ✄
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
