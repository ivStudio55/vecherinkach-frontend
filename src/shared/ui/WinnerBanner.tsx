'use client';

type WinnerBannerProps = {
  winnerName: string;
  points: number;
  speedLabel?: string;
};

export function WinnerBanner({ winnerName, points, speedLabel }: WinnerBannerProps) {
  return (
    <div className="rounded-3xl border-[4px] border-[#1f6ac6] bg-[#e9f0ff] p-6 space-y-3 animate-final-panel">
      <div className="flex items-center justify-between">
        <p className="retro-heading text-[11px] tracking-[0.4em] text-[#1f6ac6]/70">ПОБЕДИТЕЛЬ</p>
        <span className="text-3xl">🏆</span>
      </div>
      <p className="text-2xl font-black text-[#1f6ac6]">{winnerName}</p>
      <p className="text-sm font-semibold text-[#142a45]/80">Очки: {points}</p>
      {speedLabel ? <p className="text-xs text-[#142a45]/60">Скорость: {speedLabel}</p> : null}
    </div>
  );
}
