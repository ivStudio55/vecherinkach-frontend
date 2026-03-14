"use client";

import type { UnoCard } from '@/lib/uno/types';
import { cardLabel } from '@/lib/uno/api';

/* ── colour map ── */
const BG: Record<string, string> = {
  red: '#ef4444',
  yellow: '#facc15',
  green: '#4ade80',
  blue: '#3b82f6',
  wild: '#1e293b',
};

const BORDER: Record<string, string> = {
  red: '#000',
  yellow: '#000',
  green: '#000',
  blue: '#000',
  wild: '#000',
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
  const isVerbMatch = card.kind === 'verb-match' && card.display;
  const isClassicVerb = card.kind === 'number' && !!(card as any).verb_display;

  const dims = size === 'sm' ? 'w-16 h-24' : size === 'lg' ? 'w-32 h-48' : 'w-24 h-36';

  if (faceDown) {
    return (
      <div className={`${dims} comic-panel bg-blue-500 flex items-center justify-center ${className}`}>
        <span className="comic-font text-4xl text-white drop-shadow-[2px_2px_0_#000] select-none">U</span>
      </div>
    );
  }

  const label = cardLabel(card);
  const lines = label.split('\n');

  /* ── Wild 4-colour background ── */
  const wildGradient = isWild
    ? 'conic-gradient(from 45deg, #ef4444 0deg 90deg, #3b82f6 90deg 180deg, #facc15 180deg 270deg, #4ade80 270deg 360deg)'
    : undefined;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative flex flex-col items-center justify-center text-center select-none
        ${dims} rounded-xl border-4 border-black transition-all duration-200 overflow-hidden
        ${playable && !disabled ? 'cursor-pointer hover:-translate-y-3 hover:shadow-[8px_8px_0_#000] hover:z-10 shadow-[4px_4px_0_#000]' : 'shadow-[4px_4px_0_#000]'}
        ${!playable ? 'opacity-60' : ''}
        ${disabled ? 'cursor-not-allowed' : ''}
        ${className}
      `}
      style={{
        background: wildGradient ?? bg,
        color: card.color === 'yellow' ? '#000' : '#fff',
      }}
    >
      {/* Halftone overlay */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_2px,transparent_2.5px)] [background-size:10px_10px] pointer-events-none"></div>

      {/* Inner oval — comic UNO look */}
      <div
        className="absolute inset-2 rounded-[40%] bg-white border-4 border-black shadow-[inset_4px_4px_0_rgba(0,0,0,0.1)]"
        style={{ transform: 'rotate(-15deg)' }}
      />

      {/* Corner label */}
      <span className="absolute top-1.5 left-2 comic-font text-sm drop-shadow-[1px_1px_0_#000] leading-none z-20" style={{ color: card.color === 'yellow' ? '#000' : '#fff' }}>
        {card.kind === 'number' ? card.value : card.kind === 'verb' ? 'V' : card.kind === 'verb-match' ? (card.form === 'translation' ? 'RU' : 'EN') : card.kind === 'wild4' ? '+4' : card.kind === 'draw2' ? '+2' : card.kind[0]?.toUpperCase()}
      </span>

      {/* Main content */}
      <div className="relative z-20 flex flex-col items-center gap-0.5 px-1 text-black">
        {isVerbMatch ? (
          <>
            <span className={`comic-font leading-tight text-center drop-shadow-[1px_1px_0_#fff] ${size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-xs' : 'text-sm'}`}>
              {card.display}
            </span>
            {card.form && (
              <span className="comic-font-thin font-bold text-[9px] uppercase tracking-wider mt-0.5 bg-black text-white px-1 rounded">
                {card.form === 'translation' ? 'ПЕРЕВОД' : card.form === 'infinitive' ? 'INF' : card.form === 'past_simple' ? 'V2' : 'V3'}
              </span>
            )}
          </>
        ) : isVerb ? (
          <>
            <span className="comic-font text-sm leading-tight drop-shadow-[1px_1px_0_#fff]">{lines[0]}</span>
            <span className="comic-font-thin font-bold text-[10px] leading-tight">{lines[1]}</span>
            <span className="comic-font-thin font-bold text-[10px] leading-tight">{lines[2]}</span>
            {card.verb?.translation && (
              <span className="comic-font-thin font-bold text-[9px] mt-0.5 bg-black text-white px-1 rounded">{card.verb.translation}</span>
            )}
          </>
        ) : isClassicVerb ? (
          <>
            <span className={`comic-font leading-none drop-shadow-[2px_2px_0_#fff] ${size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-xl' : 'text-3xl'}`} style={{ color: card.color === 'yellow' ? '#000' : bg }}>
              {card.value}
            </span>
            <span className={`comic-font-thin font-bold leading-tight text-center mt-0.5 drop-shadow-[1px_1px_0_#fff] ${size === 'lg' ? 'text-sm' : 'text-[9px]'}`}>
              {(card as any).verb_display}
            </span>
          </>
        ) : (
          <span className={`comic-font leading-none drop-shadow-[2px_2px_0_#fff] ${size === 'lg' ? 'text-6xl' : size === 'sm' ? 'text-2xl' : 'text-4xl'}`} style={{ color: card.color === 'yellow' ? '#000' : bg }}>
            {label}
          </span>
        )}
      </div>

      {/* Bottom corner */}
      <span className="absolute bottom-1.5 right-2 comic-font text-sm drop-shadow-[1px_1px_0_#000] rotate-180 leading-none z-20" style={{ color: card.color === 'yellow' ? '#000' : '#fff' }}>
        {card.kind === 'number' ? card.value : card.kind === 'verb' ? 'V' : card.kind === 'verb-match' ? (card.form === 'translation' ? 'RU' : 'EN') : card.kind === 'wild4' ? '+4' : card.kind === 'draw2' ? '+2' : card.kind[0]?.toUpperCase()}
      </span>
    </button>
  );
}
