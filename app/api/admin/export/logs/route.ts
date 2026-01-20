import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

function parseRange(url: URL) {
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

const toCsv = (rows: Array<Record<string, unknown>>) => {
  const headers = ['created_at', 'level', 'channel', 'event_name', 'room_id', 'player_id', 'message'];
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    const line = headers
      .map((key) => String(row[key] ?? '').replace(/"/g, '""'))
      .map((value) => `"${value}"`)
      .join(',');
    lines.push(line);
  });
  return lines.join('\n');
};

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const range = parseRange(url);
  if (!range) {
    return Response.json({ error: 'Invalid range. Provide start and end as ISO strings.' }, { status: 400 });
  }

  const roomId = url.searchParams.get('room_id') || url.searchParams.get('roomId');
  const playerId = url.searchParams.get('player_id') || url.searchParams.get('playerId');
  const eventName = url.searchParams.get('event_name') || url.searchParams.get('eventName');
  const level = url.searchParams.get('level');
  const channel = url.searchParams.get('channel');

  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from('logs')
    .select('created_at, level, channel, event_name, room_id, player_id, message')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (roomId) query = query.eq('room_id', roomId);
  if (playerId) query = query.eq('player_id', playerId);
  if (eventName) query = query.eq('event_name', eventName);
  if (level) query = query.eq('level', level);
  if (channel) query = query.eq('channel', channel);

  const { data, error } = await query;
  if (error) {
    return Response.json({ error: error.message ?? 'Failed to export logs' }, { status: 500 });
  }

  const csv = toCsv((data ?? []) as Array<Record<string, unknown>>);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="logs-export.csv"',
    },
  });
}
