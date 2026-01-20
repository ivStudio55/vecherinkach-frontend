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

function parsePaging(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('limit') ?? 25)));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

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
  const search = url.searchParams.get('search');

  const { page, pageSize, offset } = parsePaging(url);
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('logs')
    .select('id, created_at, level, channel, message, event_name, room_id, player_id, session_id, page, user_agent, context', { count: 'exact' })
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (roomId) query = query.eq('room_id', roomId);
  if (playerId) query = query.eq('player_id', playerId);
  if (eventName) query = query.eq('event_name', eventName);
  if (level) query = query.eq('level', level);
  if (channel) query = query.eq('channel', channel);
  if (search) {
    const like = `%${search}%`;
    query = query.or(`message.ilike.${like},event_name.ilike.${like},channel.ilike.${like}`);
  }

  const { data, error, count } = await query;
  if (error) {
    return Response.json({ error: error.message ?? 'Failed to load logs' }, { status: 500 });
  }

  return Response.json({
    page,
    pageSize,
    total: count ?? 0,
    items: (data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      level: row.level,
      channel: row.channel,
      message: row.message,
      eventName: row.event_name,
      roomId: row.room_id,
      playerId: row.player_id,
      sessionId: row.session_id,
      page: row.page,
      userAgent: row.user_agent,
      context: row.context,
    })),
  });
}
