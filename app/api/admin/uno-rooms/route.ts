import { NextResponse } from 'next/server';
import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

/* GET  — list UNO rooms with player counts */
export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const supabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');           // lobby | playing | finished
  const mode   = searchParams.get('mode');             // classic | irregular-verbs | verb-match
  const page   = parseInt(searchParams.get('page') || '1', 10);
  const limit  = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('uno_rooms')
    .select('id, code, mode, status, direction, host_id, winner_id, verb_count, state_version, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (mode) query = query.eq('mode', mode);

  const { data: rooms, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch player counts for each room
  const roomIds = (rooms || []).map(r => r.id);
  let playerCounts: Record<string, number> = {};
  if (roomIds.length > 0) {
    const { data: players } = await supabase
      .from('uno_players')
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

/* DELETE — delete a specific UNO room */
export async function DELETE(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const supabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('id');
  if (!roomId) return NextResponse.json({ error: 'Missing room id' }, { status: 400 });

  // Cascading delete (players + events deleted via FK cascade)
  const { error } = await supabase.from('uno_rooms').delete().eq('id', roomId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

/* PATCH — close/finish a specific UNO room */
export async function PATCH(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const supabase = getSupabaseAdminClient();
  const body = await request.json().catch(() => ({}));
  const roomId = body.id;
  const newStatus = body.status;

  if (!roomId) return NextResponse.json({ error: 'Missing room id' }, { status: 400 });
  if (!newStatus || !['lobby', 'playing', 'finished'].includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('uno_rooms')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ room: data });
}
