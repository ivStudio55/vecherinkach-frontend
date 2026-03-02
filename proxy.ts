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

export function proxy(request: NextRequest) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    // Fail closed: if env vars are not set, do not expose /admin.
    return unauthorized();
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) return unauthorized();

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
