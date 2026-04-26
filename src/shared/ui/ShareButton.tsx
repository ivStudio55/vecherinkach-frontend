'use client';

import { useState } from 'react';

interface ShareButtonProps {
  rank: number | null;
  points: number | null;
  gameName: string;
  className?: string;
}

export function ShareButton({ rank, points, gameName, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const r = rank ?? 0;
    const pointsText = points != null ? ` (${points} очков)` : '';
    const text =
      r === 1
        ? `🏆 Я победил в «${gameName}»${pointsText}! Попробуй сам:`
        : r > 0
          ? `🎮 Занял ${r} место в «${gameName}»${pointsText}. Попробуй сам:`
          : `🎮 Сыграл в «${gameName}»! Попробуй сам:`;
    const url = 'https://vecherinkach.ru';

    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text, url }); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch { /* clipboard not available */ }
    }
  };

  return (
    <button type="button" onClick={handleShare} className={className}>
      {copied ? '✅ Скопировано!' : '📤 Поделиться результатом'}
    </button>
  );
}
