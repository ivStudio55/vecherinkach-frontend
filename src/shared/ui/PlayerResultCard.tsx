'use client';

import { ScoreSummary } from './ScoreSummary';

type PlayerResultCardProps = {
  rank: number | null;
  points: number | null;
  totalPlayers: number | null;
  isLoading?: boolean;
  isWinner?: boolean;
};

export function PlayerResultCard({ rank, points, totalPlayers, isLoading, isWinner }: PlayerResultCardProps) {
  return (
    <div className={`rounded-3xl border-[4px] p-6 space-y-4 ${isWinner ? 'border-[#1f6ac6] bg-[#e9f0ff]' : 'border-[#142a45]/15 bg-[#fff6da]'} animate-final-panel`}>
      <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/60">ВАШ РЕЗУЛЬТАТ</p>
      <ScoreSummary points={points} rank={rank} totalPlayers={totalPlayers} isLoading={isLoading} />
      <p className="text-sm text-[#142a45]/70">
        {isWinner ? 'Ты лучший сегодня — поздравляем!' : 'Спасибо за игру! Ведущий объявит победителя.'}
      </p>
    </div>
  );
}
