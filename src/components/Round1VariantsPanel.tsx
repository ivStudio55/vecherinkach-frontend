'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

export type Round1VariantsPanelHandle = {
  hideCorrect: () => Promise<void>;
};

type Props = {
  options: string[];
  correctIndex: number;
  points: number;
  revealCorrect: boolean;
  questionKey: string | number;
};

const ENTER_TOTAL_MS = 850 + 100 * 3 + 60;
const HIDE_TOTAL_MS = 600 + 40;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

export const Round1VariantsPanel = forwardRef<Round1VariantsPanelHandle, Props>(function Round1VariantsPanel(
  { options, correctIndex, points, revealCorrect, questionKey },
  ref
) {
  const tileRefs = useMemo(
    () => Array.from({ length: 4 }, () => React.createRef<HTMLDivElement>()),
    []
  );

  const [phase, setPhase] = useState<'entering' | 'ready' | 'falling' | 'afterFall' | 'hiding'>('entering');
  const enterTimeoutRef = useRef<number | null>(null);
  const fallTimeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const revealedForKeyRef = useRef<string | number | null>(null);

  const clearTimers = useCallback(() => {
    if (enterTimeoutRef.current) {
      window.clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }
    if (fallTimeoutRef.current) {
      window.clearTimeout(fallTimeoutRef.current);
      fallTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const resetTilesForNewQuestion = useCallback(() => {
    clearTimers();
    revealedForKeyRef.current = null;

    tileRefs.forEach((tileRef, positionIndex) => {
      const el = tileRef.current;
      if (!el) return;

      el.classList.remove('variants-tile-enter');
      el.classList.remove('variants-tile-fall');
      el.classList.remove('variants-tile-invisible');
      el.classList.remove('variants-tile-hide');

      el.style.removeProperty('--dx');
      el.style.removeProperty('--rot');
      el.style.removeProperty('--dur');
      el.style.removeProperty('--delay');
      el.style.removeProperty('--drop');
      el.style.setProperty('--enter-delay', `${positionIndex * 100}ms`);
    });

    setPhase('entering');

    // Trigger enter animation in a new frame.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tileRefs.forEach((tileRef) => tileRef.current?.classList.add('variants-tile-enter'));

        if (prefersReducedMotion()) {
          tileRefs.forEach((tileRef) => tileRef.current?.classList.remove('variants-tile-enter'));
          setPhase('ready');
          return;
        }

        enterTimeoutRef.current = window.setTimeout(() => {
          tileRefs.forEach((tileRef) => tileRef.current?.classList.remove('variants-tile-enter'));
          setPhase('ready');
        }, ENTER_TOTAL_MS);
      });
    });
  }, [clearTimers, tileRefs]);

  useEffect(() => {
    resetTilesForNewQuestion();
    return () => {
      clearTimers();
    };
  }, [questionKey, resetTilesForNewQuestion, clearTimers]);

  const applyRandomFallVars = useCallback((el: HTMLDivElement) => {
    const dx = Math.round(randomBetween(-180, 180));
    const rot = Math.round(randomBetween(-200, 200));
    const dur = Math.round(randomBetween(800, 1300));
    const delay = Math.round(randomBetween(0, 220));
    const drop = Math.round(randomBetween(500, 680));

    el.style.setProperty('--dx', `${dx}px`);
    el.style.setProperty('--rot', `${rot}deg`);
    el.style.setProperty('--dur', `${dur}ms`);
    el.style.setProperty('--delay', `${delay}ms`);
    el.style.setProperty('--drop', `${drop}px`);

    return { dur, delay };
  }, []);

  const fallIncorrect = useCallback(() => {
    if (phase !== 'ready') return;

    const tiles = tileRefs.map((r) => r.current).filter(Boolean) as HTMLDivElement[];
    if (tiles.length !== 4) return;

    setPhase('falling');

    let maxEnd = 0;
    let fallenCount = 0;

    tiles.forEach((tile, index) => {
      const isCorrect = index === correctIndex;
      if (isCorrect) return;

      const timings = applyRandomFallVars(tile);
      const end = timings.delay + timings.dur;
      maxEnd = Math.max(maxEnd, end);
      tile.classList.add('variants-tile-fall');
      fallenCount += 1;
    });

    if (prefersReducedMotion()) {
      tiles.forEach((tile, index) => {
        if (index !== correctIndex) {
          tile.classList.add('variants-tile-invisible');
        }
      });
      setPhase('afterFall');
      return;
    }

    fallTimeoutRef.current = window.setTimeout(() => {
      tiles.forEach((tile, index) => {
        if (index === correctIndex) return;
        tile.classList.remove('variants-tile-fall');
        tile.classList.add('variants-tile-invisible');
      });
      setPhase('afterFall');
    }, maxEnd + 40);

    if (fallenCount === 0) {
      setPhase('afterFall');
    }
  }, [phase, tileRefs, correctIndex, applyRandomFallVars]);

  useEffect(() => {
    if (!revealCorrect) {
      revealedForKeyRef.current = null;
      return;
    }

    if (revealedForKeyRef.current === questionKey) {
      return;
    }

    revealedForKeyRef.current = questionKey;
    fallIncorrect();
  }, [revealCorrect, questionKey, fallIncorrect]);

  const hideCorrect = useCallback(async () => {
    if (prefersReducedMotion()) {
      return;
    }

    const correctEl = tileRefs[correctIndex]?.current;
    if (!correctEl) {
      return;
    }

    // If we haven't revealed yet, don't do the outro.
    if (!revealCorrect || (phase !== 'afterFall' && phase !== 'ready')) {
      return;
    }

    clearTimers();
    setPhase('hiding');

    correctEl.classList.add('variants-tile-hide');

    await new Promise<void>((resolve) => {
      hideTimeoutRef.current = window.setTimeout(() => {
        resolve();
      }, HIDE_TOTAL_MS);
    });
  }, [correctIndex, tileRefs, revealCorrect, phase, clearTimers]);

  useImperativeHandle(
    ref,
    () => ({
      hideCorrect,
    }),
    [hideCorrect]
  );

  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
        <span className="w-14 h-14 rounded-full border-[3px] flex items-center justify-center font-black text-sm opacity-85 border-[#142a45]/15 bg-[#fff6da] text-[#142a45]">
          +{points}
        </span>
      </div>

      <div className="variants-stage">
        <div className="variants-grid">
          {Array.from({ length: 4 }, (_, index) => {
            const option = options[index] ?? '';
            const isCorrect = index === correctIndex;
            const isHighlighted = revealCorrect && isCorrect;

            return (
              <div
                key={`pos-${index}`}
                ref={tileRefs[index]}
                className={
                  `variants-tile variants-pos-${index} ` +
                  (isHighlighted ? 'variants-tile-correct' : 'variants-tile-neutral')
                }
                aria-hidden={phase === 'entering' ? 'true' : 'false'}
              >
                <span className="text-xl sm:text-2xl font-black leading-tight px-2">{option}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
