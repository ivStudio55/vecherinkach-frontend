'use client';

import { CSSProperties } from 'react';

type DuckVariant = 1;
type DuckDrift = 1 | 2 | 3 | 4;

type DuckSpriteProps = {
  variant: DuckVariant;
  delayMs?: number;
  drift?: DuckDrift;
  className?: string;
  style?: CSSProperties;
};

export function DuckSprite({
  variant,
  delayMs = 0,
  drift = 1,
  className,
  style,
}: DuckSpriteProps) {
  const spriteMap: Record<DuckVariant, { src: string; frames: number; durationMs: number; frameWidth: number; frameHeight: number }> = {
    1: { src: '/img/spritesheet/3.png', frames: 9, durationMs: 900, frameWidth: 158, frameHeight: 187 },
  };

  const sprite = spriteMap[variant];

  const outerStyle: CSSProperties = {
    animationDelay: `${delayMs}ms`,
    ...style,
  };

  const spriteStyle: CSSProperties = {
    // Explicit sizing/background math to avoid bleeding or showing the whole strip at once.
    width: `${sprite.frameWidth}px`,
    height: `${sprite.frameHeight}px`,
    overflow: 'hidden',
    backgroundImage: `url('${sprite.src}')`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0px 0px',
    backgroundSize: '1422px 187px',
    imageRendering: 'pixelated',
    animation: `duckStepX-9 ${sprite.durationMs}ms steps(8) infinite`,
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
