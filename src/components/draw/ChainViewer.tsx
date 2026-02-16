'use client';

import { useEffect, useState } from 'react';
import type { DrawStep, DrawPlayer } from '@/lib/draw/types';

interface ChainViewerProps {
  originalWord: string;
  steps: DrawStep[];
  players: DrawPlayer[];
  /** If true, reveal steps one by one with animation */
  animated?: boolean;
}

export default function ChainViewer({ originalWord, steps, players, animated }: ChainViewerProps) {
  const [revealCount, setRevealCount] = useState(animated ? 0 : steps.length + 1);

  useEffect(() => {
    if (!animated) {
      setRevealCount(steps.length + 1);
      return;
    }
    setRevealCount(0);
    let i = 0;
    const max = steps.length + 1; // +1 for original word
    const timer = setInterval(() => {
      i++;
      setRevealCount(i);
      if (i >= max) clearInterval(timer);
    }, 1500);
    return () => clearInterval(timer);
  }, [animated, steps.length]);

  const getPlayerName = (playerId: string) =>
    players.find(p => p.id === playerId)?.name || '???';

  const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Original word */}
      {revealCount >= 1 && (
        <div className="animate-fadeIn rounded-2xl border-2 border-yellow-400/50 bg-yellow-400/10 px-6 py-3 text-center">
          <span className="text-xs uppercase tracking-[0.3em] text-white/60">Стартовое слово</span>
          <p className="text-2xl font-black text-yellow-300">{originalWord}</p>
        </div>
      )}

      <div className="flex items-center text-white/40 text-2xl">↓</div>

      {/* Steps */}
      {sortedSteps.map((step, idx) => {
        const visible = revealCount >= idx + 2;
        if (!visible) return null;

        const isLast = idx === sortedSteps.length - 1;

        return (
          <div key={step.id} className="animate-fadeIn flex flex-col items-center gap-2 w-full">
            {/* Guess (for step >= 2) */}
            {step.guess && (
              <div className={`rounded-xl border px-4 py-2 text-center ${step.is_correct ? 'border-green-400/50 bg-green-400/10' : 'border-red-400/40 bg-red-400/10'}`}>
                <span className="text-xs text-white/60">
                  {getPlayerName(step.player_id)} угадал:
                </span>
                <p className="text-lg font-bold text-white">
                  {step.guess} {step.is_correct ? '✅' : '❌'}
                </p>
              </div>
            )}

            {/* Drawing */}
            {step.drawing_data && (
              <div className={`rounded-2xl border-2 overflow-hidden ${isLast ? 'border-yellow-400 shadow-lg shadow-yellow-400/20' : 'border-white/20'}`}>
                <div className="relative">
                  <img
                    src={step.drawing_data}
                    alt={`Рисунок от ${getPlayerName(step.player_id)}`}
                    className="w-full max-w-[280px] aspect-square object-contain bg-white"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-1 text-xs text-white/90 text-center">
                    🎨 {getPlayerName(step.player_id)}
                    {isLast && <span className="ml-2 text-yellow-300 font-bold">★ финальный</span>}
                  </div>
                </div>
              </div>
            )}

            {!step.drawing_data && step.submitted && (
              <div className="rounded-2xl border-2 border-white/10 bg-white/5 w-[200px] aspect-square flex items-center justify-center text-white/40">
                Пустой рисунок
              </div>
            )}

            {idx < sortedSteps.length - 1 && (
              <div className="text-white/40 text-2xl">↓</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
