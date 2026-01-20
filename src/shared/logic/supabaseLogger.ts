'use client';

import { supabase } from '@/lib/supabase';
import { addLogSink, type LogEvent } from './logger';

let initialized = false;
let teardown: (() => void) | null = null;

const LOG_FLUSH_INTERVAL_MS = 5000;
const LOG_BATCH_SIZE = 10;

const getSessionId = () => {
  if (typeof window === 'undefined') {
    return 'server';
  }
  const existing = window.localStorage.getItem('clientSessionId');
  if (existing) {
    return existing;
  }
  const next = `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  window.localStorage.setItem('clientSessionId', next);
  return next;
};

const extractMeta = (event: LogEvent) => {
  const context = event.context ?? {};
  const roomId = typeof context.roomId === 'string' ? context.roomId : null;
  const playerId = typeof context.playerId === 'string' ? context.playerId : null;
  const eventName = typeof context.eventName === 'string' ? context.eventName : null;
  const page = typeof window !== 'undefined' ? window.location.pathname : null;
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

  return {
    room_id: roomId,
    player_id: playerId,
    event_name: eventName,
    session_id: getSessionId(),
    page,
    user_agent: userAgent,
  };
};

const mapLogRow = (event: LogEvent) => ({
  level: event.level,
  channel: event.channel,
  message: event.message,
  context: event.context ?? null,
  client_timestamp: new Date(event.timestamp).toISOString(),
  ...extractMeta(event),
});

export const initSupabaseLogging = () => {
  if (initialized) {
    return teardown;
  }
  if (typeof window === 'undefined') {
    return null;
  }

  initialized = true;
  const queue: LogEvent[] = [];

  const flush = async () => {
    if (!queue.length) {
      return;
    }
    const batch = queue.splice(0, queue.length);
    await supabase.from('logs').insert(batch.map(mapLogRow));
  };

  const sink = (event: LogEvent) => {
    queue.push(event);
    if (queue.length >= LOG_BATCH_SIZE) {
      void flush();
    }
  };

  const unsubscribe = addLogSink(sink);
  const intervalId = window.setInterval(() => {
    void flush();
  }, LOG_FLUSH_INTERVAL_MS);

  const handleBeforeUnload = () => {
    void flush();
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  teardown = () => {
    window.clearInterval(intervalId);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    unsubscribe();
  };

  return teardown;
};
