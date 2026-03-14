import { NextResponse } from 'next/server';
import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const game = searchParams.get('game') || 'vecherinkach';
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const db = getSupabaseAdminClient();

  const tableMap: Record<string, { rooms: string; players: string }> = {
    vecherinkach: { rooms: 'rooms', players: 'players' },
    jokester: { rooms: 'jokester_rooms', players: 'jokester_players' },
    creativach: { rooms: 'creativach_rooms', players: 'creativach_players' },
    draw: { rooms: 'draw_rooms', players: 'draw_players' },
    uno: { rooms: 'uno_rooms', players: 'uno_players' },
  };

  const tables = tableMap[game];
  if (!tables) return NextResponse.json({ error: 'Unknown game' }, { status: 400 });

  let query = db
    .from(tables.rooms)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to + 'T23:59:59.999Z');
  const { data: rooms } = await query;

  // Get player counts per room
  const roomIds = (rooms ?? []).map((r: Record<string, unknown>) => r.id);
  let playerCounts: Record<string, number> = {};
  if (roomIds.length > 0) {
    const { data: playerData } = await db
      .from(tables.players)
      .select('room_id')
      .in('room_id', roomIds);
    if (playerData) {
      for (const p of playerData) {
        playerCounts[p.room_id] = (playerCounts[p.room_id] || 0) + 1;
      }
    }
  }

  return NextResponse.json({
    rooms: (rooms ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      player_count: playerCounts[r.id as string] || 0,
    })),
  });
}
