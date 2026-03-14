import { NextResponse } from 'next/server';
import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const game = searchParams.get('game') || 'vecherinkach';
  const roomId = searchParams.get('roomId');
  if (!roomId) return NextResponse.json({ error: 'roomId required' }, { status: 400 });

  const db = getSupabaseAdminClient();

  if (game === 'vecherinkach') {
    const [{ data: room }, { data: players }, { data: answers }] = await Promise.all([
      db.from('rooms').select('*').eq('id', roomId).single(),
      db.from('players').select('*').eq('room_id', roomId).order('joined_at'),
      db.from('answers').select('*').eq('room_id', roomId).order('submitted_at'),
    ]);
    return NextResponse.json({ room, players: players ?? [], answers: answers ?? [] });
  }

  if (game === 'jokester') {
    const [{ data: room }, { data: players }, { data: duels }] = await Promise.all([
      db.from('jokester_rooms').select('*').eq('id', roomId).single(),
      db.from('jokester_players').select('*').eq('room_id', roomId).order('joined_at'),
      db.from('jokester_duels').select('*').eq('room_id', roomId).order('round,duel_index'),
    ]);
    return NextResponse.json({ room, players: players ?? [], duels: duels ?? [] });
  }

  if (game === 'creativach') {
    const [{ data: room }, { data: players }, { data: answers }, { data: votes }] = await Promise.all([
      db.from('creativach_rooms').select('*').eq('id', roomId).single(),
      db.from('creativach_players').select('*').eq('room_id', roomId).order('joined_at'),
      db.from('creativach_answers').select('*').eq('room_id', roomId).order('round,submitted_at'),
      db.from('creativach_votes').select('*').eq('room_id', roomId).order('round,created_at'),
    ]);
    return NextResponse.json({ room, players: players ?? [], answers: answers ?? [], votes: votes ?? [] });
  }

  if (game === 'draw') {
    const [{ data: room }, { data: players }, { data: chains }] = await Promise.all([
      db.from('draw_rooms').select('*').eq('id', roomId).single(),
      db.from('draw_players').select('*').eq('room_id', roomId).order('joined_at'),
      db.from('draw_chains').select('*').eq('room_id', roomId).order('round,chain_index'),
    ]);
    return NextResponse.json({ room, players: players ?? [], chains: chains ?? [] });
  }

  if (game === 'uno') {
    const [{ data: room }, { data: players }] = await Promise.all([
      db.from('uno_rooms').select('*').eq('id', roomId).single(),
      db.from('uno_players').select('*').eq('room_id', roomId).order('joined_at'),
    ]);
    return NextResponse.json({ room, players: players ?? [] });
  }

  return NextResponse.json({ error: 'Unknown game' }, { status: 400 });
}
