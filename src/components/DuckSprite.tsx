'use client';

import { CSSProperties } from 'react';

type DuckVariant = 1 | 2;
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
    1: { src: '/img/spritesheet/3.png', frames: 8, durationMs: 900, frameWidth: 64, frameHeight: 64 },
    2: { src: '/img/spritesheet/duckinglass/flyDuck.png', frames: 8, durationMs: 900, frameWidth: 64, frameHeight: 64 },
  };

  const sprite = spriteMap[variant];

  const outerStyle: CSSProperties = {
    animationDelay: `${delayMs}ms`,
    ...style,
  };

  const baseAnimation = `duckStepX-8 ${sprite.durationMs}ms steps(${sprite.frames}) infinite`;
  const extraAnimation = variant === 2 ? ', duckFlyHorizontal 4s ease-in-out infinite alternate' : '';

  const spriteStyle: CSSProperties = {
    // Explicit sizing/background math to avoid bleeding or showing the whole strip at once.
    width: `${sprite.frameWidth}px`,
    height: `${sprite.frameHeight}px`,
    overflow: 'hidden',
    backgroundImage: `url('${sprite.src}')`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0px 0px',
    backgroundSize: `${sprite.frameWidth * sprite.frames}px ${sprite.frameHeight}px`,
    imageRendering: 'pixelated',
    animation: `${baseAnimation}${extraAnimation}`,
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
