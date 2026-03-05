// src/lib/centrifuge.ts
// Singleton Centrifuge client for WebSocket realtime (замена Supabase Realtime)
// Используется только на клиенте (browser-only).
//
// Сервер: ws://89.169.2.83:8000/connection/websocket (задаётся через NEXT_PUBLIC_CENTRIFUGO_URL)
// Канал для комнат: room:{roomId}

import { Centrifuge } from 'centrifuge';

let _client: Centrifuge | null = null;

/**
 * Возвращает синглтон Centrifuge клиент, подключённый к серверу.
 * Возвращает null если:
 * - выполняется на сервере (SSR)
 * - NEXT_PUBLIC_CENTRIFUGO_URL не задан
 */
export function getCentrifugeClient(): Centrifuge | null {
  if (typeof window === 'undefined') return null;

  const url = process.env.NEXT_PUBLIC_CENTRIFUGO_URL;
  if (!url) return null;

  if (_client) return _client;

  _client = new Centrifuge(url, {
    // anonymous connection — Centrifugo сервер должен иметь
    // allow_anonymous_connect_without_token: true
  });

  _client.connect();
  return _client;
}

/** Тип payload, который публикует pg-notifier */
export type CentrifugoPayload<T = Record<string, unknown>> = {
  table: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  room_id: string;
  data: T;
  player_id?: string;
};

/**
 * Подписывается на Centrifugo канал и вызывает onMessage при каждой публикации.
 * Если channel === null или Centrifugo не настроен, вызывает fallbackFn по интервалу.
 * Возвращает функцию отписки.
 */
export function subscribeChannel(
  channel: string | null,
  onMessage: (payload: CentrifugoPayload) => void,
  fallbackFn?: () => void,
  fallbackIntervalMs = 2000,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const client = channel ? getCentrifugeClient() : null;
  if (!client || !channel) {
    if (!fallbackFn) return () => {};
    const id = setInterval(fallbackFn, fallbackIntervalMs);
    return () => clearInterval(id);
  }

  const sub = client.newSubscription(channel);

  sub.on('publication', (ctx) => {
    onMessage(ctx.data as CentrifugoPayload);
  });

  sub.on('error', () => {
    if (fallbackFn) fallbackFn();
  });

  sub.subscribe();

  return () => {
    sub.unsubscribe();
    try { client.removeSubscription(sub); } catch { /* ignore */ }
  };
}
