import { track } from '@vercel/analytics';

type EventPayload = Record<string, string | number | boolean | null | undefined>;

export function trackGameEvent(eventName: string, payload: EventPayload = {}) {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : undefined;

  try {
    track(eventName, {
      area: 'game',
      pathname,
      ...payload,
    });
  } catch {
    // ignore analytics errors
  }
}
