'use client';

import { CSSProperties } from 'react';

type DuckVariant = 1 | 2 | 3 | 4;

type DuckSpriteProps = {
  variant: DuckVariant;
  delayMs?: number;
  drift?: DuckVariant;
  className?: string;
  style?: CSSProperties;
};

export function DuckSprite({
  variant,
  delayMs = 0,
  drift = variant,
  className,
  style,
}: DuckSpriteProps) {
  const spriteMap: Record<DuckVariant, { src: string; frames: number; durationMs: number; frameWidth: number; frameHeight: number }> = {
    1: { src: '/img/spritesheet/3.png', frames: 8, durationMs: 900, frameWidth: 165, frameHeight: 187 },
    2: { src: '/img/spritesheet/4.png', frames: 8, durationMs: 820, frameWidth: 178, frameHeight: 168 },
    3: { src: '/img/spritesheet/5.png', frames: 7, durationMs: 1050, frameWidth: 206, frameHeight: 181 },
    4: { src: '/img/spritesheet/6.png', frames: 8, durationMs: 900, frameWidth: 165, frameHeight: 200 },
  };

  const sprite = spriteMap[variant];

  const outerStyle: CSSProperties = {
    animationDelay: `${delayMs}ms`,
    ...style,
  };

  const spriteStyle: CSSProperties = {
    // Explicit sizing/background math to avoid bleeding or showing the whole strip at once.
    '--duck-frame-width': `${sprite.frameWidth}px`,
    '--duck-frame-height': `${sprite.frameHeight}px`,
    '--duck-cols': sprite.frames,
    width: `${sprite.frameWidth}px`,
    height: `${sprite.frameHeight}px`,
    backgroundImage: `url('${sprite.src}')`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0px 0px',
    backgroundSize: `${sprite.frames * 100}% 100%`,
    imageRendering: 'auto',
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
