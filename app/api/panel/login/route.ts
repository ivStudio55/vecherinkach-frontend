import { NextResponse } from 'next/server';
import { verifyPanelCredentials, createPanelToken } from '@/lib/panelAuth';

export async function POST(request: Request) {
  const body = await request.json();
  const { user, pass } = body;

  if (!verifyPanelCredentials(user, pass)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = createPanelToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set('panel_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 86400,
  });
  return res;
}
