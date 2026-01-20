'use client';

type LivePulseBadgeProps = {
  label?: string;
  className?: string;
};

export function LivePulseBadge({ label = 'Прямой эфир', className }: LivePulseBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-[#f1532f] px-3 py-1 text-[11px] font-black uppercase tracking-[0.25em] text-[#ffeccd] ${
        className ?? ''
      }`}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 live-pulse" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      {label}
      <style jsx>{`
        @keyframes livePulse {
          0% {
            opacity: 1;
          }
          20% {
            opacity: 0.55;
          }
          40% {
            opacity: 1;
          }
          60% {
            opacity: 0.65;
          }
          100% {
            opacity: 1;
          }
        }
        .live-pulse {
          animation: livePulse 1.4s ease-in-out infinite;
        }
      `}</style>
    </span>
  );
}
