import { NextResponse } from 'next/server';

type JsonHeaders = HeadersInit | undefined;

function mergeHeaders(headers: JsonHeaders, extraHeaders: HeadersInit | undefined) {
  if (!headers) return extraHeaders;
  if (!extraHeaders) return headers;
  return {
    ...Object.fromEntries(new Headers(headers).entries()),
    ...Object.fromEntries(new Headers(extraHeaders).entries()),
  };
}

export function json<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export function jsonError(
  error: string,
  status = 500,
  extras?: Record<string, unknown>,
  init?: ResponseInit,
) {
  return NextResponse.json(
    { error, ...(extras ?? {}) },
    {
      ...init,
      status,
      headers: mergeHeaders(init?.headers, { 'Content-Type': 'application/json; charset=utf-8' }),
    },
  );
}

export function withCacheControl(cacheControl: string, init?: ResponseInit): ResponseInit {
  return {
    ...init,
    headers: mergeHeaders(init?.headers, { 'Cache-Control': cacheControl }),
  };
}
