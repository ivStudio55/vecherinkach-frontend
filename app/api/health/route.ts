import { queryOne } from '@/lib/db.server';
import { json } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  const latencyMs = Date.now() - startedAt;

  try {
    await queryOne('select id from rooms limit 1');
    return json({ ok: true, latencyMs, time: new Date().toISOString() });
  } catch (error) {
    return json(
      {
        ok: false,
        latencyMs,
        error: error instanceof Error ? error.message : 'Database check failed',
        time: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
