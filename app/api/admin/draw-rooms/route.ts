import { NextResponse } from 'next/server';
import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

/* GET — list draw rooms with player counts */
export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const supabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const mode = searchParams.get('mode');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('draw_rooms')
    .select('id, code, mode, status, current_round, current_step, total_steps, voting_chain_index, step_duration, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (mode) query = query.eq('mode', mode);

  const { data: rooms, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roomIds = (rooms || []).map(r => r.id);
  let playerCounts: Record<string, number> = {};
  if (roomIds.length > 0) {
    const { data: players } = await supabase
      .from('draw_players')
      .select('room_id')
      .in('room_id', roomIds);

    if (players) {
      for (const p of players) {
        playerCounts[p.room_id] = (playerCounts[p.room_id] || 0) + 1;
      }
    }
  }

  const enriched = (rooms || []).map(r => ({
    ...r,
    player_count: playerCounts[r.id] || 0,
  }));

  return NextResponse.json({ rooms: enriched, total: count ?? 0, page, limit });
}

/* DELETE — delete a draw room and all related data */
export async function DELETE(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const supabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('id');
  if (!roomId) return NextResponse.json({ error: 'Missing room id' }, { status: 400 });

  // Delete in order: votes -> steps -> chains -> players -> room
  const { data: chains } = await supabase.from('draw_chains').select('id').eq('room_id', roomId);
  if (chains && chains.length > 0) {
    const chainIds = chains.map(c => c.id);
    await supabase.from('draw_votes').delete().eq('room_id', roomId);
    await supabase.from('draw_steps').delete().in('chain_id', chainIds);
    await supabase.from('draw_chains').delete().eq('room_id', roomId);
  }
  await supabase.from('draw_players').delete().eq('room_id', roomId);
  const { error } = await supabase.from('draw_rooms').delete().eq('id', roomId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

/* PATCH — close/finish a draw room */
export async function PATCH(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const supabase = getSupabaseAdminClient();
  const body = await request.json().catch(() => ({}));
  const roomId = body.id;
  const newStatus = body.status;

  if (!roomId) return NextResponse.json({ error: 'Missing room id' }, { status: 400 });
  if (!newStatus) return NextResponse.json({ error: 'Missing status' }, { status: 400 });

  const { error } = await supabase
    .from('draw_rooms')
    .update({ status: newStatus })
    .eq('id', roomId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
