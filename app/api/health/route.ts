import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseAdminClient();
  const startedAt = Date.now();

  const { error } = await supabase.from('rooms').select('id', { count: 'exact', head: true }).limit(1);

  const latencyMs = Date.now() - startedAt;

  if (error) {
    return Response.json(
      {
        ok: false,
        latencyMs,
        error: error.message ?? 'Supabase check failed',
        time: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, latencyMs, time: new Date().toISOString() });
}
