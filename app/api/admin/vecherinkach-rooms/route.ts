import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

/* ── GET — paginated room list with player counts ── */
export async function GET(request: Request) {
  const authErr = requireAdminBasicAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const status = url.searchParams.get('status') || '';
  const packId = url.searchParams.get('pack_id') || '';
  const search = url.searchParams.get('search') || '';
  const activeOnly = url.searchParams.get('active') === '1';

  const supabase = getSupabaseAdminClient();

  let q = supabase
    .from('rooms')
    .select(
      'id, code, status, is_active, created_at, pack_id, current_question_index, round2_item_index',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) q = q.eq('status', status);
  if (packId) q = q.eq('pack_id', packId);
  if (search) q = q.ilike('code', `%${search}%`);
  if (activeOnly) q = q.eq('is_active', true);

  const { data: rooms, count, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const roomIds = (rooms ?? []).map(r => r.id);

  // Fetch player counts for listed rooms
  const playerCounts: Record<string, number> = {};
  if (roomIds.length > 0) {
    const { data: players } = await supabase
      .from('players')
      .select('room_id')
      .in('room_id', roomIds);
    for (const p of players ?? []) {
      playerCounts[p.room_id] = (playerCounts[p.room_id] ?? 0) + 1;
    }
  }

  // Total answers per room (quick count via answers table)
  const answerCounts: Record<string, number> = {};
  if (roomIds.length > 0) {
    const { data: ans } = await supabase
      .from('answers')
      .select('room_id')
      .in('room_id', roomIds);
    for (const a of ans ?? []) {
      answerCounts[a.room_id] = (answerCounts[a.room_id] ?? 0) + 1;
    }
  }

  const items = (rooms ?? []).map(r => ({
    ...r,
    playerCount: playerCounts[r.id] ?? 0,
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

/* ── PATCH — update room fields ── */
export async function PATCH(request: Request) {
  const authErr = requireAdminBasicAuth(request);
  if (authErr) return authErr;

  const body = await request.json().catch(() => null);
  const roomId = body?.roomId;
  const patch = body?.patch;
  if (!roomId || !patch) return Response.json({ error: 'roomId and patch required' }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('rooms').update(patch).eq('id', roomId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

/* ── DELETE — cascade delete a room ── */
export async function DELETE(request: Request) {
  const authErr = requireAdminBasicAuth(request);
  if (authErr) return authErr;

  const body = await request.json().catch(() => null);
  const roomId = body?.roomId;
  if (!roomId) return Response.json({ error: 'roomId required' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  // Cascade via FK but also clean up tables without ON DELETE CASCADE
  await Promise.all([
    supabase.from('answers').delete().eq('room_id', roomId),
    supabase.from('round2_answers').delete().eq('room_id', roomId),
    supabase.from('round3_answers').delete().eq('room_id', roomId),
    supabase.from('round3_votes').delete().eq('room_id', roomId),
    supabase.from('round4_answers').delete().eq('room_id', roomId),
    supabase.from('round5_answers').delete().eq('room_id', roomId),
    supabase.from('question_likes').delete().eq('room_id', roomId),
    supabase.from('logs').delete().eq('room_id', roomId),
    supabase.from('game_results').delete().eq('room_id', roomId),
  ]);
  await supabase.from('players').delete().eq('room_id', roomId);
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
