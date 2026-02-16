"use client";

import type { UnoCard } from '@/lib/uno/types';
import { cardLabel } from '@/lib/uno/api';

/* ── colour map ── */
const BG: Record<string, string> = {
  red: '#e5383b',
  yellow: '#eab308',
  green: '#16a34a',
  blue: '#2563eb',
  wild: '#1a1a2e',
};

const BORDER: Record<string, string> = {
  red: '#ff6b6b',
  yellow: '#fde047',
  green: '#4ade80',
  blue: '#60a5fa',
  wild: '#a78bfa',
};

interface Props {
  card: UnoCard;
  playable?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}

export default function UnoCardView({ card, playable = false, disabled = false, faceDown = false, size = 'md', onClick, className = '' }: Props) {
  const bg = BG[card.color] ?? BG.wild;
  const border = BORDER[card.color] ?? BORDER.wild;
  const isWild = card.kind === 'wild' || card.kind === 'wild4';
  const isVerb = card.kind === 'verb' && card.verb;

  const dims = size === 'sm' ? 'w-16 h-24' : size === 'lg' ? 'w-28 h-40' : 'w-22 h-32';

  if (faceDown) {
    return (
      <div className={`${dims} rounded-xl bg-[#1e293b] border-2 border-[#334155] flex items-center justify-center shadow-md ${className}`}>
        <span className="text-2xl font-black text-white/20 select-none">U</span>
      </div>
    );
  }

  const label = cardLabel(card);
  const lines = label.split('\n');

  /* ── Wild 4-colour background ── */
  const wildGradient = isWild
    ? 'linear-gradient(135deg, #e5383b 25%, #2563eb 25%, #2563eb 50%, #16a34a 50%, #16a34a 75%, #eab308 75%)'
    : undefined;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative flex flex-col items-center justify-center text-center select-none
        ${dims} rounded-xl shadow-lg transition-all duration-200
        ${playable && !disabled ? 'cursor-pointer hover:-translate-y-2 hover:shadow-xl hover:z-10' : ''}
        ${!playable ? 'opacity-50' : ''}
        ${disabled ? 'cursor-not-allowed' : ''}
        ${className}
      `}
      style={{
        background: wildGradient ?? bg,
        borderWidth: 3,
        borderColor: playable ? border : 'rgba(255,255,255,0.15)',
        color: card.color === 'yellow' ? '#1a1a2e' : '#fff',
      }}
    >
      {/* Inner oval — classic UNO look */}
      <div
        className="absolute inset-2 rounded-[40%] opacity-20"
        style={{ background: 'rgba(255,255,255,0.25)' }}
      />

      {/* Corner label */}
      <span className="absolute top-1.5 left-2 text-[10px] font-bold opacity-70 leading-none">
        {card.kind === 'number' ? card.value : card.kind === 'verb' ? 'V' : card.kind === 'wild4' ? '+4' : card.kind === 'draw2' ? '+2' : card.kind[0]?.toUpperCase()}
      </span>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-0.5 px-1">
        {isVerb ? (
          <>
            <span className="text-[11px] font-bold leading-tight">{lines[0]}</span>
            <span className="text-[9px] opacity-80 leading-tight">{lines[1]}</span>
            <span className="text-[9px] opacity-80 leading-tight">{lines[2]}</span>
            {card.verb?.translation && (
              <span className="text-[8px] opacity-60 mt-0.5 italic">{card.verb.translation}</span>
            )}
          </>
        ) : (
          <span className={`font-black leading-none ${size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl'}`}>
            {label}
          </span>
        )}
      </div>

      {/* Bottom corner */}
      <span className="absolute bottom-1.5 right-2 text-[10px] font-bold opacity-70 rotate-180 leading-none">
        {card.kind === 'number' ? card.value : card.kind === 'verb' ? 'V' : card.kind === 'wild4' ? '+4' : card.kind === 'draw2' ? '+2' : card.kind[0]?.toUpperCase()}
      </span>
    </button>
  );
}
