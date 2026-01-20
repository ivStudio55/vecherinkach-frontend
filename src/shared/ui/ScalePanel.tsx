'use client';

import { useEffect, useState, type ReactNode } from 'react';

type ScalePanelProps = {
  isVisible: boolean;
  className?: string;
  children: ReactNode;
};

const TRANSITION_MS = 180;

export function ScalePanel({ isVisible, className, children }: ScalePanelProps) {
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setIsExiting(false);
      return;
    }

    if (!shouldRender) {
      return;
    }

    setIsExiting(true);
    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
      setIsExiting(false);
    }, TRANSITION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isVisible, shouldRender]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className={`${isExiting ? 'scale-panel-exit' : 'scale-panel-enter'} ${className ?? ''}`}>
      {children}
      <style jsx>{`
        @keyframes scalePanelIn {
          0% {
            transform: scale(0.9);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes scalePanelOut {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(0.9);
            opacity: 0;
          }
        }
        .scale-panel-enter {
          animation: scalePanelIn ${TRANSITION_MS}ms ease-out;
        }
        .scale-panel-exit {
          animation: scalePanelOut ${TRANSITION_MS}ms ease-in;
        }
      `}</style>
    </div>
  );
}
