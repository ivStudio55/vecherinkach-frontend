import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

/* ── GET — list rooms with player/duel counts, pagination, status filter ── */
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
    .from('jokester_rooms')
    .select('id, code, status, current_round, current_duel_index, created_at, updated_at, host_id', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('code', `%${search}%`);

  const { data: rooms, count, error } = await query;
  if (error) {
    console.error('jokester-rooms GET', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const roomRows = rooms ?? [];
  const roomIds = roomRows.map(r => r.id);

  // Player counts
  let playerCounts: Record<string, { players: number; spectators: number }> = {};
  if (roomIds.length > 0) {
    const { data: players } = await supabase
      .from('jokester_players')
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

  // Duel counts
  let duelCounts: Record<string, number> = {};
  if (roomIds.length > 0) {
    const { data: duels } = await supabase
      .from('jokester_duels')
      .select('room_id')
      .in('room_id', roomIds);
    if (duels) {
      for (const d of duels) {
        duelCounts[d.room_id] = (duelCounts[d.room_id] ?? 0) + 1;
      }
    }
  }

  const items = roomRows.map(r => ({
    ...r,
    playerCount: playerCounts[r.id]?.players ?? 0,
    spectatorCount: playerCounts[r.id]?.spectators ?? 0,
    duelCount: duelCounts[r.id] ?? 0,
  }));

  return Response.json({
    items,
    total: count ?? 0,
    page,
    pageSize: limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

/* ── DELETE — cascade delete a jokester room ── */
export async function DELETE(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const body = await request.json().catch(() => null);
  const roomId = body?.roomId;
  if (!roomId) return Response.json({ error: 'roomId required' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  // Get duel IDs first for cascading
  const { data: duels } = await supabase.from('jokester_duels').select('id').eq('room_id', roomId);
  const duelIds = (duels ?? []).map(d => d.id);

  // Delete in order: votes, answers, duels, category_votes, used_questions, players, room
  if (duelIds.length > 0) {
    await supabase.from('jokester_votes').delete().in('duel_id', duelIds);
    await supabase.from('jokester_answers').delete().in('duel_id', duelIds);
  }
  await supabase.from('jokester_duels').delete().eq('room_id', roomId);
  await supabase.from('jokester_category_votes').delete().eq('room_id', roomId);
  await supabase.from('jokester_used_questions').delete().eq('room_id', roomId);
  await supabase.from('jokester_players').delete().eq('room_id', roomId);
  const { error } = await supabase.from('jokester_rooms').delete().eq('id', roomId);

  if (error) {
    console.error('jokester-rooms DELETE', error);
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
  const { error } = await supabase.from('jokester_rooms').update(patch).eq('id', roomId);
  if (error) {
    console.error('jokester-rooms PATCH', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
