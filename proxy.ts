import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin"',
    },
  });
}

async function verifyAdminSession(value: string): Promise<boolean> {
  const expected = process.env.ADMIN_SESSION_SECRET ?? '';
  if (!expected || !value) return false;
  if (value.length !== expected.length) return false;
  const enc = new TextEncoder();
  const a = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(value));
  const b = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(expected));
  const ab = new Uint8Array(a);
  const bb = new Uint8Array(b);
  return ab.every((byte, i) => byte === bb[i]);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth endpoints through
  if (pathname === '/admin/login' || pathname.startsWith('/api/admin/auth/')) {
    return NextResponse.next();
  }

  // Check session cookie first (cookie-based admin auth)
  const cookieValue = request.cookies.get('admin_session')?.value ?? '';
  if (await verifyAdminSession(cookieValue)) {
    return NextResponse.next();
  }

  // Fall back to Basic Auth
  const expectedUser = process.env.ADMIN_USER;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return unauthorized();
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    // If no auth header and no valid session, redirect to login for non-API routes
    if (!pathname.startsWith('/api/')) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return unauthorized();
  }

  const [scheme, encoded] = authorization.split(' ');
  if (scheme !== 'Basic' || !encoded) return unauthorized();

  let decoded = '';
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return unauthorized();

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (user !== expectedUser || password !== expectedPassword) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
