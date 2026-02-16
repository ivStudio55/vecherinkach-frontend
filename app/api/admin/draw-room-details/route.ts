import { NextResponse } from 'next/server';
import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const supabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('id');
  if (!roomId) return NextResponse.json({ error: 'Missing room id' }, { status: 400 });

  // Room
  const { data: room, error: roomErr } = await supabase
    .from('draw_rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  if (roomErr) return NextResponse.json({ error: roomErr.message }, { status: 500 });

  // Players
  const { data: players } = await supabase
    .from('draw_players')
    .select('id, name, is_host, seat, score, joined_at')
    .eq('room_id', roomId)
    .order('seat');

  // Chains
  const { data: chains } = await supabase
    .from('draw_chains')
    .select('id, round, chain_index, original_word, created_at')
    .eq('room_id', roomId)
    .order('round')
    .order('chain_index');

  // Steps (with drawings)
  const chainIds = (chains || []).map(c => c.id);
  let steps: Array<Record<string, unknown>> = [];
  if (chainIds.length > 0) {
    const { data: stepsData } = await supabase
      .from('draw_steps')
      .select('id, chain_id, step_number, player_id, target_word, guess, drawing_data, is_correct, submitted, created_at')
      .in('chain_id', chainIds)
      .order('step_number');
    steps = stepsData || [];
  }

  // Votes
  const { data: votes } = await supabase
    .from('draw_votes')
    .select('id, round, chain_id, voter_id, voted_for_player_id, created_at')
    .eq('room_id', roomId)
    .order('created_at');

  // Build player name lookup
  const playerNames: Record<string, string> = {};
  for (const p of players || []) {
    playerNames[p.id] = p.name;
  }

  return NextResponse.json({
    room,
    players: players || [],
    chains: chains || [],
    steps,
    votes: votes || [],
    playerNames,
  });
}
