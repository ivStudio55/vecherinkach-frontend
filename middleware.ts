import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

async function verifyAdminSession(value: string): Promise<boolean> {
  const expected = process.env.ADMIN_SESSION_SECRET ?? '';
  if (!expected || !value) return false;
  if (value.length !== expected.length) return false;
  const enc = new TextEncoder();
  // Compare hashes to avoid timing attacks on the raw token comparison
  const a = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(value));
  const b = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(expected));
  const ab = new Uint8Array(a);
  const bb = new Uint8Array(b);
  return ab.every((byte, i) => byte === bb[i]);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth endpoints through
  if (pathname === '/admin/login' || pathname.startsWith('/api/admin/auth/')) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get('admin_session')?.value ?? '';
  const isValid = await verifyAdminSession(cookieValue);

  if (!isValid) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
