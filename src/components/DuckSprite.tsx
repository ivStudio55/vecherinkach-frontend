'use client';

import { CSSProperties } from 'react';

type DuckVariant = 1 | 2 | 3 | 4;

type DuckSpriteProps = {
  variant: DuckVariant;
  size?: number;
  delayMs?: number;
  drift?: DuckVariant;
  className?: string;
  style?: CSSProperties;
};

export function DuckSprite({
  variant,
  size = 96,
  delayMs = 0,
  drift = variant,
  className,
  style,
}: DuckSpriteProps) {
  const spriteMap: Record<DuckVariant, { src: string; frames: number; durationMs: number }> = {
    1: { src: '/img/spritesheet/3.png', frames: 8, durationMs: 900 },
    2: { src: '/img/spritesheet/4.png', frames: 8, durationMs: 820 },
    3: { src: '/img/spritesheet/5.png', frames: 7, durationMs: 1050 },
    4: { src: '/img/spritesheet/6.png', frames: 8, durationMs: 900 },
  };

  const sprite = spriteMap[variant];

  const outerStyle: CSSProperties = {
    animationDelay: `${delayMs}ms`,
    ...style,
  };

  const spriteStyle: CSSProperties = {
    '--duck-frame': `${size}px`,
    '--duck-cols': sprite.frames,
    '--duck-rows': 1,
    '--duck-row': 0,
    backgroundImage: `url('${sprite.src}')`,
    animation: `duckStepX ${sprite.durationMs}ms steps(${sprite.frames}) infinite`,
  } as CSSProperties;

  return (
    <div
      className={['duck-appear', className].filter(Boolean).join(' ')}
      style={outerStyle}
    >
      <div className={[`duck-drift-${drift}`].join(' ')}>
        <div className="duck-sprite" style={spriteStyle} />
      </div>
    </div>
  );
}
