import { Fragment } from 'react';

type AnimatedTextProps = {
  text: string;
  className?: string;
  startDelayMs?: number;
  staggerMs?: number;
  maxStaggerMs?: number;
};

export function AnimatedText({
  text,
  className,
  startDelayMs = 0,
  staggerMs = 18,
  maxStaggerMs = 900,
}: AnimatedTextProps) {
  const chars = String(text ?? '');

  return (
    <span className={['animated-text', className].filter(Boolean).join(' ')} aria-label={chars}>
      {Array.from(chars).map((char, index) => {
        if (char === '\n') {
          return <br key={`br-${index}`} />;
        }

        const delayMs = Math.min(startDelayMs + index * staggerMs, startDelayMs + maxStaggerMs);

        return (
          <Fragment key={`ch-${index}`}>
            <span className="animated-text-char" style={{ animationDelay: `${delayMs}ms` }} aria-hidden>
              {char}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}
