'use client';

type QuestionLikeButtonProps = {
  liked: boolean;
  likesCount?: number | null;
  onLike: () => void;
  disabled?: boolean;
};

export function QuestionLikeButton({ liked, likesCount, onLike, disabled }: QuestionLikeButtonProps) {
  return (
    <button
      type="button"
      onClick={onLike}
      disabled={disabled || liked}
      className={`w-full flex items-center justify-between gap-3 rounded-2xl border-[3px] px-4 py-3 font-black transition ${
        liked
          ? 'border-[#2f7a3b] bg-[#dff7e3] text-[#1b4d23]'
          : 'border-[#142a45] bg-white text-[#142a45] hover:bg-[#fff6da]'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span>{liked ? '❤️ Спасибо за лайк!' : '👍 Лайкнуть вопрос'}</span>
      <span className="text-sm font-semibold">{likesCount !== null && likesCount !== undefined ? `${likesCount} ❤` : ''}</span>
    </button>
  );
}
