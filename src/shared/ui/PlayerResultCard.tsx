'use client';

import { ScoreSummary } from './ScoreSummary';

type PlayerResultCardProps = {
  rank: number | null;
  points: number | null;
  totalPlayers: number | null;
  isLoading?: boolean;
  isWinner?: boolean;
  footerText?: string;
};

export function PlayerResultCard({ rank, points, totalPlayers, isLoading, isWinner, footerText }: PlayerResultCardProps) {
  const message =
    footerText ?? (isWinner ? 'Ты лучший сегодня — поздравляем!' : 'Ждём раунд…');
  return (
    <div className={`rounded-3xl border-[4px] p-6 space-y-4 ${isWinner ? 'border-[#1f6ac6] bg-[#e9f0ff]' : 'border-[#142a45]/15 bg-[#fff6da]'} animate-final-panel`}>
      <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/60">ВАШ РЕЗУЛЬТАТ</p>
      <ScoreSummary points={points} rank={rank} totalPlayers={totalPlayers} isLoading={isLoading} title={null} />
      <p className="text-sm text-[#142a45]/70">{message}</p>
    </div>
  );
}
