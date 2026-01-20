'use client';

import { useEffect } from 'react';
import { initSupabaseLogging } from '@/shared/logic/supabaseLogger';

export const ClientBootstrap = () => {
  useEffect(() => {
    const teardown = initSupabaseLogging();
    return () => {
      if (typeof teardown === 'function') {
        teardown();
      }
    };
  }, []);

  return null;
};
