import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

/* ── GET — list creativach rooms with player counts ── */
export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const status = url.searchParams.get('status') || '';
  const search = url.searchParams.get('search') || '';

  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('creativach_rooms')
    .select('id, code, status, current_round, voting_phase, created_at, updated_at, host_id', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('code', `%${search}%`);

  const { data: rooms, count, error } = await query;
  if (error) {
    console.error('creativach-rooms GET', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const roomRows = rooms ?? [];
  const roomIds = roomRows.map(r => r.id);

  let playerCounts: Record<string, { players: number; spectators: number }> = {};
  if (roomIds.length > 0) {
    const { data: players } = await supabase
      .from('creativach_players')
      .select('room_id, role, is_host')
      .in('room_id', roomIds);
    if (players) {
      for (const p of players) {
        if (p.is_host) continue;
        if (!playerCounts[p.room_id]) playerCounts[p.room_id] = { players: 0, spectators: 0 };
        if (p.role === 'player') playerCounts[p.room_id].players += 1;
        else playerCounts[p.room_id].spectators += 1;
      }
    }
  }

  let answerCounts: Record<string, number> = {};
  if (roomIds.length > 0) {
    const { data: answers } = await supabase
      .from('creativach_answers')
      .select('room_id')
      .in('room_id', roomIds);
    if (answers) {
      for (const a of answers) {
        answerCounts[a.room_id] = (answerCounts[a.room_id] ?? 0) + 1;
      }
    }
  }

  const items = roomRows.map(r => ({
    ...r,
    playerCount: playerCounts[r.id]?.players ?? 0,
    spectatorCount: playerCounts[r.id]?.spectators ?? 0,
    answerCount: answerCounts[r.id] ?? 0,
  }));

  return Response.json({
    items,
    total: count ?? 0,
    page,
    pageSize: limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

/* ── DELETE — cascade delete a creativach room ── */
export async function DELETE(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const body = await request.json().catch(() => null);
  const roomId = body?.roomId;
  if (!roomId) return Response.json({ error: 'roomId required' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  await supabase.from('creativach_votes').delete().eq('room_id', roomId);
  await supabase.from('creativach_answers').delete().eq('room_id', roomId);
  await supabase.from('creativach_players').delete().eq('room_id', roomId);
  const { error } = await supabase.from('creativach_rooms').delete().eq('id', roomId);

  if (error) {
    console.error('creativach-rooms DELETE', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

/* ── PATCH — update room status (close/restart) ── */
export async function PATCH(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const body = await request.json().catch(() => null);
  const roomId = body?.roomId;
  const patch = body?.patch;
  if (!roomId || !patch) return Response.json({ error: 'roomId and patch required' }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('creativach_rooms').update(patch).eq('id', roomId);
  if (error) {
    console.error('creativach-rooms PATCH', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
