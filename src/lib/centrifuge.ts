// src/lib/centrifuge.ts
// Singleton Centrifuge client for WebSocket realtime (замена Supabase Realtime)
// Используется только на клиенте (browser-only).
//
// Сервер: ws://89.169.2.83:8000/connection/websocket (задаётся через NEXT_PUBLIC_CENTRIFUGO_URL)
// Канал для комнат: room:{roomId}

import { Centrifuge, type Subscription } from 'centrifuge';

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

// ── Subscription pool (handler-level ref counting) ───────────────────────────
// Позволяет нескольким вызовам subscribeChannel использовать одну подписку
// на канал (вместо client.newSubscription, которая бросает при дубликате).

type PoolEntry = {
  sub: Subscription;
  handlers: Set<(payload: CentrifugoPayload) => void>;
  fallbackIds: Set<ReturnType<typeof setInterval>>;
};

const _pool = new Map<string, PoolEntry>();

function getOrCreateSub(client: Centrifuge, channel: string): PoolEntry {
  const existing = _pool.get(channel);
  if (existing) return existing;

  // Если клиент уже имеет подписку (edge-case после hot reload), переиспользуем
  let sub: Subscription;
  const maybeSub = client.getSubscription(channel);
  if (maybeSub) {
    sub = maybeSub;
  } else {
    sub = client.newSubscription(channel);
  }

  const entry: PoolEntry = { sub, handlers: new Set(), fallbackIds: new Set() };

  sub.on('publication', (ctx) => {
    const payload = ctx.data as CentrifugoPayload;
    for (const h of entry.handlers) {
      try { h(payload); } catch { /* ignore per-handler errors */ }
    }
  });

  sub.on('error', () => {
    // ignore — fallback intervals handle polling
  });

  sub.subscribe();

  _pool.set(channel, entry);
  return entry;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Подписывается на Centrifugo канал и вызывает onMessage при каждой публикации.
 * Несколько вызовов для одного channel безопасны — все они используют одну
 * underlying Subscription (handler-level ref counting).
 *
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

  // ── Fallback-only mode (no Centrifugo configured or no channel) ──
  if (!client || !channel) {
    if (!fallbackFn) return () => {};
    const id = setInterval(fallbackFn, fallbackIntervalMs);
    return () => clearInterval(id);
  }

  // ── Centrifugo mode ──
  const entry = getOrCreateSub(client, channel);
  entry.handlers.add(onMessage);

  let fallbackId: ReturnType<typeof setInterval> | null = null;
  if (fallbackFn) {
    fallbackId = setInterval(fallbackFn, fallbackIntervalMs);
    entry.fallbackIds.add(fallbackId);
  }

  return () => {
    entry.handlers.delete(onMessage);
    if (fallbackId !== null) {
      clearInterval(fallbackId);
      entry.fallbackIds.delete(fallbackId);
    }

    // Когда все хендлеры отписались — убираем саму подписку
    if (entry.handlers.size === 0) {
      try { entry.sub.unsubscribe(); } catch { /* ignore */ }
      try { client.removeSubscription(entry.sub); } catch { /* ignore */ }
      _pool.delete(channel);
    }
  };
}
