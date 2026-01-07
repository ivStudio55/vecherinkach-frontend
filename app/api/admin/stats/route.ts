import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

function parseRange(url: URL) {
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const range = parseRange(url);
  if (!range) {
    return Response.json({ error: 'Invalid range. Provide start and end as ISO strings.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const [
    roomsTotal,
    playersTotal,
    roomsInRange,
    playersInRange,
    roomsActive,
    roomsFinished,
  ] = await Promise.all([
    supabase.from('rooms').select('id', { count: 'exact', head: true }),
    supabase.from('players').select('id', { count: 'exact', head: true }),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).gte('created_at', range.startIso).lt('created_at', range.endIso),
    supabase.from('players').select('id', { count: 'exact', head: true }).gte('joined_at', range.startIso).lt('joined_at', range.endIso),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('status', 'finished'),
  ]);

  const anyError = roomsTotal.error || playersTotal.error || roomsInRange.error || playersInRange.error || roomsActive.error || roomsFinished.error;
  if (anyError) {
    const message = (anyError as { message?: string } | null)?.message ?? 'Failed to load stats';
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({
    range,
    rooms: {
      total: roomsTotal.count ?? 0,
      inRange: roomsInRange.count ?? 0,
      active: roomsActive.count ?? 0,
      finished: roomsFinished.count ?? 0,
    },
    players: {
      total: playersTotal.count ?? 0,
      inRange: playersInRange.count ?? 0,
    },
  });
}
