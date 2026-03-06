import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password } = body as { password?: string };

  const expectedPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!expectedPassword || !sessionSecret) {
    return NextResponse.json({ error: 'Сервер не настроен (ADMIN_PASSWORD или ADMIN_SESSION_SECRET не заданы)' }, { status: 503 });
  }

  // Timing-safe password comparison via SHA-256 digests
  const enc = new TextEncoder();
  let valid = false;
  try {
    const a = await crypto.subtle.digest('SHA-256', enc.encode(password ?? ''));
    const b = await crypto.subtle.digest('SHA-256', enc.encode(expectedPassword));
    const ab = new Uint8Array(a);
    const bb = new Uint8Array(b);
    valid = ab.every((v, i) => v === bb[i]);
  } catch {
    valid = false;
  }

  if (!valid) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('admin_session', sessionSecret, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return response;
}
