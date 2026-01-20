'use client';

type BestQuestionCardProps = {
  questionText: string;
  likes: number;
  className?: string;
};

export function BestQuestionCard({ questionText, likes, className }: BestQuestionCardProps) {
  return (
    <div className={`rounded-3xl border-[3px] border-[#142a45] bg-white p-5 space-y-3 ${className ?? ''}`}>
      <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Лучший вопрос игры</p>
      <p className="text-lg font-black text-[#142a45]">{questionText || '—'}</p>
      <div className="text-sm font-semibold text-[#f1532f]">❤ {likes}</div>
    </div>
  );
}
