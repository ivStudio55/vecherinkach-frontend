import { Fragment } from 'react';

type AnimatedTextProps = {
  text: string;
  className?: string;
  startDelayMs?: number;
  staggerMs?: number;
  maxTotalMs?: number;
};

export function AnimatedText({
  text,
  className,
  startDelayMs = 0,
  staggerMs = 18,
  maxTotalMs = 1200,
}: AnimatedTextProps) {
  const chars = String(text ?? '');

  const safeLength = Math.max(1, chars.length);
  const effectiveStaggerMs =
    safeLength <= 1 ? 0 : Math.max(0, Math.min(staggerMs, Math.floor(maxTotalMs / Math.max(1, safeLength - 1))));

  const tokens = chars.split(/(\s+)/);
  let globalCharIndex = 0;

  return (
    <span className={['animated-text', className].filter(Boolean).join(' ')} aria-label={chars}>
      {tokens.map((token, tokenIndex) => {
        if (!token) {
          return null;
        }

        if (token.includes('\n')) {
          const parts = token.split(/(\n)/);
          return (
            <Fragment key={`nl-${tokenIndex}`}>
              {parts.map((part, partIndex) => {
                if (part === '\n') {
                  return <br key={`br-${tokenIndex}-${partIndex}`} />;
                }

                if (/^\s+$/.test(part)) {
                  return <Fragment key={`ws-${tokenIndex}-${partIndex}`}>{part}</Fragment>;
                }

                const wordChars = Array.from(part);
                return (
                  <span key={`w-${tokenIndex}-${partIndex}`} className="animated-text-word" aria-hidden>
                    {wordChars.map((char, idx) => {
                      const delayMs = startDelayMs + globalCharIndex * effectiveStaggerMs;
                      globalCharIndex += 1;
                      return (
                        <span
                          key={`ch-${tokenIndex}-${partIndex}-${idx}`}
                          className="animated-text-char"
                          style={{ animationDelay: `${delayMs}ms` }}
                          aria-hidden
                        >
                          {char}
                        </span>
                      );
                    })}
                  </span>
                );
              })}
            </Fragment>
          );
        }

        if (/^\s+$/.test(token)) {
          return <Fragment key={`ws-${tokenIndex}`}>{token}</Fragment>;
        }

        const wordChars = Array.from(token);
        return (
          <span key={`w-${tokenIndex}`} className="animated-text-word" aria-hidden>
            {wordChars.map((char, idx) => {
              const delayMs = startDelayMs + globalCharIndex * effectiveStaggerMs;
              globalCharIndex += 1;
              return (
                <span
                  key={`ch-${tokenIndex}-${idx}`}
                  className="animated-text-char"
                  style={{ animationDelay: `${delayMs}ms` }}
                  aria-hidden
                >
                  {char}
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}
