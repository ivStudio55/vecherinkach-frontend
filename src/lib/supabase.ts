// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
  global: {
    fetch: (url, options = {}) => {
      if (typeof window === 'undefined') {
        return fetch(url, options);
      }

      const headers = new Headers(options.headers || {});
      let roomId: string | null = null;
      let roomCode: string | null = null;
      let playerId: string | null = null;

      try {
        roomId = localStorage.getItem('roomId') || localStorage.getItem('hostRoomId');
        roomCode = localStorage.getItem('roomCode') || localStorage.getItem('hostRoomCode');
        playerId = localStorage.getItem('playerId');
      } catch {
        // localStorage can be blocked in some browser modes (Edge/Privacy). Keep request intact.
      }

      if (roomId) headers.set('x-room-id', roomId);
      if (roomCode) headers.set('x-room-code', roomCode);
      if (playerId) headers.set('x-player-id', playerId);

      return fetch(url, { ...options, headers });
    },
  },
});