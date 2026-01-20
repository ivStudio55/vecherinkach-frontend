'use client';

import { QuestionLikeButton } from './QuestionLikeButton';

type QuestionLikePanelProps = {
  isVisible: boolean;
  liked: boolean;
  likesCount?: number | null;
  onLike: () => void;
  disabled?: boolean;
  className?: string;
};

export function QuestionLikePanel({
  isVisible,
  liked,
  likesCount,
  onLike,
  disabled,
  className,
}: QuestionLikePanelProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className={`rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-4 space-y-3 ${className ?? ''}`}>
      <p className="retro-heading text-[11px] tracking-[0.35em] text-[#142a45]/60">ЛАЙК ВОПРОСА</p>
      <QuestionLikeButton liked={liked} likesCount={likesCount} onLike={onLike} disabled={disabled} />
    </div>
  );
}
