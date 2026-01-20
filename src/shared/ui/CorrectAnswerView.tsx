'use client';

type CorrectAnswerViewProps = {
  correctLabel: string;
  correctText: string;
  playerLabel?: string;
  playerText?: string;
  isCorrect?: boolean | null;
  className?: string;
};

export function CorrectAnswerView({
  correctLabel,
  correctText,
  playerLabel,
  playerText,
  isCorrect,
  className,
}: CorrectAnswerViewProps) {
  const resultTone = isCorrect === true ? 'border-[#2f7a3b] bg-[#dff7e3]' : isCorrect === false ? 'border-[#b23324] bg-[#ffd7d0]' : 'border-[#142a45]/20 bg-[#fff6da]';
  const resultText = isCorrect === true ? 'Верно!' : isCorrect === false ? 'Неверно' : 'Ответ не зафиксирован';

  return (
    <div className={`rounded-3xl border-[3px] p-5 space-y-4 animate-round3-panel ${resultTone} ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Правильный ответ</p>
        <span className="text-xs font-black text-[#142a45]">{resultText}</span>
      </div>
      <div className="rounded-2xl border-[3px] border-[#142a45] bg-white px-4 py-3">
        <p className="text-xs font-semibold text-[#142a45]/70">{correctLabel}</p>
        <p className="text-lg font-black text-[#142a45]">{correctText || '—'}</p>
      </div>
      <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-[#fffaf0] px-4 py-3">
        <p className="text-xs font-semibold text-[#142a45]/70">Ваш ответ</p>
        <p className="text-lg font-black text-[#142a45]">{playerLabel ? `${playerLabel} · ${playerText ?? '—'}` : playerText ?? '—'}</p>
      </div>
    </div>
  );
}
