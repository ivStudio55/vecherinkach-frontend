type ScoreSummaryProps = {
  points: number | null;
  rank: number | null;
  totalPlayers?: number | null;
  isLoading?: boolean;
  className?: string;
  variant?: 'compact' | 'default';
  title?: string | null;
};

const formatValue = (value: number | null, isLoading?: boolean) => {
  if (value === null || value === undefined) {
    return isLoading ? '…' : '—';
  }
  return String(value);
};

export const ScoreSummary = ({
  points,
  rank,
  totalPlayers,
  isLoading,
  className,
  variant = 'default',
  title,
}: ScoreSummaryProps) => {
  const containerClass =
    variant === 'compact'
      ? 'rounded-2xl border-[3px] border-[#142a45]/15 bg-white p-4'
      : 'rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-5';
  const resolvedTitle = title === undefined ? 'ВАШ ПРОГРЕСС' : title;

  return (
    <div className={`${containerClass} space-y-3 ${className ?? ''}`}>
      {resolvedTitle ? (
        <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/60">{resolvedTitle}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border-[3px] border-[#142a45]/15 bg-white px-5 py-4">
          <p className="text-[11px] font-semibold tracking-[0.25em] text-[#142a45]/60">ОЧКИ</p>
          <p className="text-4xl font-black tabular-nums leading-none">{formatValue(points, isLoading)}</p>
        </div>
        <div className="rounded-2xl border-[3px] border-[#142a45]/15 bg-white p-4">
          <p className="text-[11px] font-semibold tracking-[0.25em] text-[#142a45]/60">МЕСТО</p>
          <p className="text-3xl font-black tabular-nums">
            {formatValue(rank, isLoading)}
            {totalPlayers ? <span className="text-base font-black text-[#142a45]/60">/{totalPlayers}</span> : null}
          </p>
        </div>
      </div>
    </div>
  );
};
