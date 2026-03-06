import crypto from 'crypto';

function verifySessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const expected = process.env.ADMIN_SESSION_SECRET ?? '';
  if (!expected) return false;
  const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('admin_session='));
  if (!match) return false;
  const value = match.slice('admin_session='.length);
  if (value.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function requireAdminBasicAuth(request: Request): Response | null {
  // First try session cookie (used by browser-based admin UI)
  if (verifySessionCookie(request.headers.get('cookie'))) return null;

  const expectedUser = process.env.ADMIN_USER;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"',
      },
    });
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"',
      },
    });
  }

  const [scheme, encoded] = authorization.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"',
      },
    });
  }

  let decoded = '';
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"',
      },
    });
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"',
      },
    });
  }

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  if (user !== expectedUser || password !== expectedPassword) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"',
      },
    });
  }

  return null;
}
