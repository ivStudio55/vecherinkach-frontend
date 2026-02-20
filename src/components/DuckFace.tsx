// src/components/DuckFace.tsx
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';

const DUCK_SOUND_COUNT = 7;
const BLINK_MIN_MS = 3000;
const BLINK_MAX_MS = 6000;

export function DuckFace({ size = 140 }: { size?: number }) {
  const containerRef = useRef<SVGSVGElement>(null);
  const [mousePos, setMousePos] = useState({ dx: 0, dy: 0, dist: 0 });
  const [blinking, setBlinking] = useState(false);
  const [quacking, setQuacking] = useState(false);
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
        // Sometimes double blink
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

  /* ── Click: quack ── */
  const handleClick = useCallback(() => {
    setQuacking(true);
    setTimeout(() => setQuacking(false), 250);

    const idx = Math.floor(Math.random() * DUCK_SOUND_COUNT) + 1;
    const audio = new Audio(`/audio/duck/${idx}.mp3`);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  }, []);

  /* ── Derived values ── */
  const { dx, dy, dist } = mousePos;
  const side = dx < -15 ? -1 : dx > 15 ? 1 : 0;

  // Smooth pupil movement
  const maxShift = 10;
  const pupilScale = Math.min(maxShift, dist * 0.04);
  const px = dist > 0 ? (dx / dist) * pupilScale : 0;
  const py = dist > 0 ? (dy / dist) * pupilScale : 0;

  // Head parallax
  const headX = dist > 0 ? (dx / dist) * Math.min(6, dist * 0.015) : 0;
  const headY = dist > 0 ? (dy / dist) * Math.min(6, dist * 0.015) : 0;

  // Suspicious eye logic
  const leftEyeScale = side === -1 ? 1.15 : side === 1 ? 0.85 : 1;
  const rightEyeScale = side === 1 ? 1.15 : side === -1 ? 0.85 : 1;
  
  const leftEyeSquint = side === 1 ? 0.7 : 1;
  const rightEyeSquint = side === -1 ? 0.7 : 1;

  const blinkScaleY = blinking ? 0.1 : 1;

  // Eyebrows
  const leftBrowY = side === 1 ? 4 : side === -1 ? -6 : 0;
  const rightBrowY = side === -1 ? 4 : side === 1 ? -6 : 0;
  const leftBrowRot = side === 1 ? 10 : side === -1 ? -15 : 0;
  const rightBrowRot = side === -1 ? -10 : side === 1 ? 15 : 0;

  // Beak
  const beakBottomY = quacking ? 14 : 0;

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
    <div
      className="relative mx-auto cursor-pointer select-none"
      style={{ width: size, height: size }}
      title="Кликни! 🦆"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      <div
        className="absolute inset-0 rounded-full border-[4px] border-[#142a45] overflow-hidden bg-white"
        style={ringStyle}
      >
        <svg
          ref={containerRef}
          viewBox="0 0 200 200"
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g style={{ transform: `translate(${headX}px, ${headY}px)`, transition: `transform ${tSmooth}` }}>
            {/* ── Head Base ── */}
            <path d="M 30 120 C 30 30, 170 30, 170 120 C 170 210, 30 210, 30 120 Z" fill="#FFD54F" />
            <path d="M 30 120 C 30 30, 170 30, 170 120 C 170 210, 30 210, 30 120 Z" fill="none" stroke="#FBC02D" strokeWidth="6" />

            {/* ── Hair Tuft ── */}
            <g stroke="#FBC02D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 90 45 Q 75 15 65 25 Q 80 40 90 45 Z" fill="#FFD54F" />
              <path d="M 100 40 Q 105 5 115 15 Q 105 30 100 40 Z" fill="#FFD54F" />
              <path d="M 110 45 Q 130 20 140 30 Q 125 45 110 45 Z" fill="#FFD54F" />
            </g>

            {/* ── Cheeks ── */}
            <ellipse cx="45" cy="115" rx="14" ry="8" fill="#FF8A65" opacity="0.6" />
            <ellipse cx="155" cy="115" rx="14" ry="8" fill="#FF8A65" opacity="0.6" />

            {/* ── Left Eye ── */}
            <g
              style={{
                transform: `scale(${leftEyeScale}) scaleY(${leftEyeSquint * blinkScaleY})`,
                transformOrigin: '70px 90px',
                transition: `transform ${blinking ? tFast : tSmooth}`,
              }}
            >
              <ellipse cx="70" cy="90" rx="22" ry="28" fill="#FFFFFF" stroke="#3E2723" strokeWidth="4" />
              <g style={{ transform: `translate(${px}px, ${py}px)`, transition: `transform ${tFast}` }}>
                <ellipse cx="70" cy="90" rx="11" ry="13" fill="#3E2723" />
                <circle cx="65" cy="84" r="4" fill="#FFFFFF" />
                <circle cx="75" cy="96" r="1.5" fill="#FFFFFF" />
              </g>
            </g>

            {/* ── Right Eye ── */}
            <g
              style={{
                transform: `scale(${rightEyeScale}) scaleY(${rightEyeSquint * blinkScaleY})`,
                transformOrigin: '130px 90px',
                transition: `transform ${blinking ? tFast : tSmooth}`,
              }}
            >
              <ellipse cx="130" cy="90" rx="22" ry="28" fill="#FFFFFF" stroke="#3E2723" strokeWidth="4" />
              <g style={{ transform: `translate(${px}px, ${py}px)`, transition: `transform ${tFast}` }}>
                <ellipse cx="130" cy="90" rx="11" ry="13" fill="#3E2723" />
                <circle cx="125" cy="84" r="4" fill="#FFFFFF" />
                <circle cx="135" cy="96" r="1.5" fill="#FFFFFF" />
              </g>
            </g>

            {/* ── Left Brow ── */}
            <path
              d="M 45 65 Q 70 50 90 65"
              fill="none" stroke="#3E2723" strokeWidth="5" strokeLinecap="round"
              style={{
                transform: `translate(0px, ${leftBrowY}px) rotate(${leftBrowRot}deg)`,
                transformOrigin: '70px 60px',
                transition: `transform ${tSmooth}`,
              }}
            />

            {/* ── Right Brow ── */}
            <path
              d="M 110 65 Q 130 50 155 65"
              fill="none" stroke="#3E2723" strokeWidth="5" strokeLinecap="round"
              style={{
                transform: `translate(0px, ${rightBrowY}px) rotate(${rightBrowRot}deg)`,
                transformOrigin: '130px 60px',
                transition: `transform ${tSmooth}`,
              }}
            />

            {/* ── Beak Back (inside mouth) ── */}
            <path d="M 65 130 Q 100 155 135 130 Q 100 175 65 130 Z" fill="#3E2723" />

            {/* ── Beak Bottom ── */}
            <path
              d="M 70 135 Q 100 170 130 135 Q 100 155 70 135 Z"
              fill="#F57C00"
              style={{
                transform: `translate(0px, ${beakBottomY}px)`,
                transition: `transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)`,
              }}
            />

            {/* ── Beak Top ── */}
            <path
              d="M 55 125 Q 100 105 145 125 Q 150 145 100 150 Q 50 145 55 125 Z"
              fill="#FF9800" stroke="#E65100" strokeWidth="3" strokeLinejoin="round"
            />
            <path d="M 65 122 Q 100 112 135 122" stroke="#FFB74D" strokeWidth="4" strokeLinecap="round" fill="none" />
            
            {/* ── Nostrils ── */}
            <ellipse cx="88" cy="120" rx="2.5" ry="4" fill="#E65100" opacity="0.8" transform="rotate(-15 88 120)" />
            <ellipse cx="112" cy="120" rx="2.5" ry="4" fill="#E65100" opacity="0.8" transform="rotate(15 112 120)" />
          </g>
        </svg>
      </div>
    </div>
  );
}
