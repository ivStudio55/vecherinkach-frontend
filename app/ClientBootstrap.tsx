'use client';

import { useEffect } from 'react';
import { initSupabaseLogging } from '@/shared/logic/supabaseLogger';

export const ClientBootstrap = () => {
  useEffect(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args: []) {
      try {
        const result = originalPlay.apply(this, args as never);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          return (result as Promise<void>).catch((error: unknown) => {
            if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'AbortError') {
              return;
            }
            throw error;
          }) as Promise<void>;
        }
        return result as Promise<void>;
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'AbortError') {
          return Promise.resolve();
        }
        return Promise.reject(error);
      }
    };

    const teardown = initSupabaseLogging();
    return () => {
      HTMLMediaElement.prototype.play = originalPlay;
      if (typeof teardown === 'function') {
        teardown();
      }
    };
  }, []);

  return null;
};
