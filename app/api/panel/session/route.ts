import { requirePanelAuth } from '@/lib/panelAuth';
import { json } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;
  return json({ ok: true });
}
