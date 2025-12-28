'use client';

import { CSSProperties } from 'react';
import duckSheet from '../../app/img/spritesheet/2.png';

type DuckVariant = 1 | 2 | 3 | 4 | 5;

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
  const outerStyle: CSSProperties = {
    animationDelay: `${delayMs}ms`,
    ...style,
  };

  return (
    <div
      className={[
        'duck-appear',
        `duck-drift-${drift}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={outerStyle}
    >
      <div
        className={['duck-sprite', `duck-variant-${variant}`].join(' ')}
        style={
          {
            '--duck-frame': `${size}px`,
            backgroundImage: `url(${duckSheet.src})`,
          } as CSSProperties
        }
      />
    </div>
  );
}
