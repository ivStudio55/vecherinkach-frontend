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

type LogRow = {
  event_name: string | null;
  player_id: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
};

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const range = parseRange(url);
  if (!range) {
    return Response.json({ error: 'Invalid range. Provide start and end as ISO strings.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('logs')
    .select('event_name, player_id, context, created_at')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .in('event_name', ['player_join', 'player_exit', 'round_start'])
    .limit(5000);

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to load analytics' }, { status: 500 });
  }

  const rows = (data ?? []) as LogRow[];
  const uniquePlayers = new Set<string>();
  let roundsStarted = 0;
  const exitByStatus: Record<string, number> = {};
  const exitByReason: Record<string, number> = {};

  rows.forEach((row) => {
    if (row.event_name === 'player_join' && row.player_id) {
      uniquePlayers.add(row.player_id);
    }
    if (row.event_name === 'round_start') {
      roundsStarted += 1;
    }
    if (row.event_name === 'player_exit') {
      const status = typeof row.context?.status === 'string' ? row.context.status : 'unknown';
      const reason = typeof row.context?.reason === 'string' ? row.context.reason : 'unknown';
      exitByStatus[status] = (exitByStatus[status] ?? 0) + 1;
      exitByReason[reason] = (exitByReason[reason] ?? 0) + 1;
    }
  });

  return Response.json({
    range,
    players: {
      unique: uniquePlayers.size,
    },
    rounds: {
      started: roundsStarted,
    },
    exits: {
      byStatus: exitByStatus,
      byReason: exitByReason,
    },
  });
}
