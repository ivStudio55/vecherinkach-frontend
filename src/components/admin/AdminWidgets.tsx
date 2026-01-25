'use client';

import type { ReactNode } from 'react';

export type SeriesPoint = { label: string; value: number };

const statusStyles: Record<string, string> = {
  success: 'border-[#2f7a3b] bg-[#dff7e3] text-[#1b4d23]',
  warning: 'border-[#b68c1d] bg-[#fff2c8] text-[#6a4a06]',
  error: 'border-[#b23324] bg-[#ffd7d0] text-[#7b1d16]',
  neutral: 'border-[#142a45] bg-white text-[#142a45]',
  info: 'border-[#1f6ac6] bg-[#e9f0ff] text-[#1f3d6b]',
};

export function SectionCard({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-3xl border-[3px] border-[#142a45] bg-white p-5 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">{title}</p>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  status = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  status?: 'success' | 'warning' | 'error' | 'neutral' | 'info';
}) {
  const style = statusStyles[status] ?? statusStyles.neutral;
  return (
    <div className={`rounded-3xl border-[3px] p-4 space-y-2 ${style}`}>
      <p className="retro-heading text-[11px] tracking-[0.35em] opacity-70">{label}</p>
      <p className="text-3xl font-black">{value}</p>
      {hint ? <p className="text-xs font-semibold opacity-70">{hint}</p> : null}
    </div>
  );
}

export function StatusBadge({ label, status = 'neutral' }: { label: string; status?: 'success' | 'warning' | 'error' | 'neutral' | 'info' }) {
  const style = statusStyles[status] ?? statusStyles.neutral;
  return <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black border-[2px] ${style}`}>{label}</span>;
}

export function BarChart({ title, series, valueSuffix }: { title: string; series: SeriesPoint[]; valueSuffix?: string }) {
  const maxValue = Math.max(1, ...series.map((point) => point.value));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-[#142a45]">{title}</p>
        <p className="text-xs font-semibold text-[#142a45]/60">{series.length} точек</p>
      </div>
      <div className="space-y-1">
        <div className="flex items-end gap-2 h-28">
          {series.map((point) => {
            const height = Math.max(6, Math.round((point.value / maxValue) * 100));
            return (
              <div key={point.label} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-xl bg-[#1f6ac6]/80 hover:bg-[#1f6ac6]"
                  style={{ height: `${height}%` }}
                  title={`${point.label}: ${point.value}${valueSuffix ?? ''}`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {series.map((point) => (
            <div key={point.label} className="flex-1 text-center text-[9px] font-bold text-[#142a45]/60">
              {point.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MetricRow({ label, value, status }: { label: string; value: ReactNode; status?: 'success' | 'warning' | 'error' | 'neutral' | 'info' }) {
  return (
    <div className="flex items-center justify-between text-sm font-semibold">
      <span className="text-[#142a45]/70">{label}</span>
      <span className={status ? statusStyles[status] : 'text-[#142a45]'}>{value}</span>
    </div>
  );
}
