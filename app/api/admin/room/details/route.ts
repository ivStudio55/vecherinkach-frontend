import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const roomId = url.searchParams.get('roomId');
  if (!roomId) {
    return Response.json({ error: 'roomId is required' }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)) {
    return Response.json({ error: 'Invalid roomId' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const roomQuery = supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
  const { data: room, error: roomError } = await roomQuery;

  if (roomError) {
    return Response.json({ error: roomError.message ?? 'Failed to load room' }, { status: 500 });
  }
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, name, total_points, joined_at, room_id')
    .eq('room_id', room.id)
    .order('total_points', { ascending: false });

  if (playersError) {
    return Response.json({ error: playersError.message ?? 'Failed to load players' }, { status: 500 });
  }

  const { data: logs, error: logsError } = await supabase
    .from('logs')
    .select('id, created_at, level, channel, message, event_name, player_id, context')
    .eq('room_id', room.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (logsError) {
    return Response.json({ error: logsError.message ?? 'Failed to load logs' }, { status: 500 });
  }

  const { data: bestQuestion, error: bestQuestionError } = await supabase
    .rpc('get_best_question', { p_room_id: room.id })
    .maybeSingle();

  if (bestQuestionError) {
    return Response.json({ error: bestQuestionError.message ?? 'Failed to load likes' }, { status: 500 });
  }

  return Response.json({
    room,
    players: players ?? [],
    logs: logs ?? [],
    bestQuestion: bestQuestion ?? null,
  });
}
