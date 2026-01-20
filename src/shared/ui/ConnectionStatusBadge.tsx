'use client';

type ConnectionStatusBadgeProps = {
  mode: 'realtime' | 'polling' | 'reconnecting';
};

export function ConnectionStatusBadge({ mode }: ConnectionStatusBadgeProps) {
  const styles =
    mode === 'realtime'
      ? 'border-[#2f7a3b] bg-[#dff7e3] text-[#1b4d23]'
      : mode === 'reconnecting'
        ? 'border-[#b68c1d] bg-[#fff2c8] text-[#6a4a06]'
        : 'border-[#b23324] bg-[#ffd7d0] text-[#7b1d16]';
  const label = mode === 'realtime' ? 'Realtime' : mode === 'reconnecting' ? 'Reconnecting' : 'Fallback';
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full border-[2px] text-[11px] font-black ${styles}`}>{label}</span>
  );
}
