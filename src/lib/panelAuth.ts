// Panel authentication helper
// Uses a simple token in cookie to protect the admin panel

const PANEL_USER = process.env.ADMIN_USER || 'vecheradmin';
const PANEL_PASS = process.env.ADMIN_PASSWORD || 'K9$xLm2!vQr7Zp';
const PANEL_SECRET = process.env.ADMIN_SESSION_SECRET || 'f3k9x7qz_panel_secret_2026';

export function verifyPanelCredentials(user: string, pass: string): boolean {
  return user === PANEL_USER && pass === PANEL_PASS;
}

export function createPanelToken(): string {
  // Simple HMAC-like token: base64(timestamp:hash)
  const ts = Date.now().toString();
  const payload = `${ts}:${PANEL_SECRET}`;
  return Buffer.from(payload).toString('base64');
}

export function verifyPanelToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [ts, secret] = decoded.split(':');
    if (secret !== PANEL_SECRET) return false;
    // Token valid for 24 hours
    const age = Date.now() - parseInt(ts, 10);
    return age < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function requirePanelAuth(request: Request): Response | null {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/panel_token=([^;]+)/);
  if (!match) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const token = decodeURIComponent(match[1]);
  if (!verifyPanelToken(token)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
