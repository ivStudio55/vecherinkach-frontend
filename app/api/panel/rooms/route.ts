import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';
import { PANEL_GAME_TABLES, PANEL_ROOM_LIST_FIELDS, type PanelGameKey } from '@/lib/panel/config';
import { json, jsonError } from '@/lib/server/api';

type RoomListRow = Record<string, unknown> & { id: string };
type PlayerRoomRef = { room_id: string };

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const game = (searchParams.get('game') || 'vecherinkach') as PanelGameKey;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const db = getSupabaseAdminClient();

  const tables = PANEL_GAME_TABLES[game];
  if (!tables) return jsonError('Unknown game', 400);

  let query = db
    .from(tables.rooms)
    .select(PANEL_ROOM_LIST_FIELDS[game])
    .order('created_at', { ascending: false })
    .limit(50);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);

  const { data: roomsData } = await query;
  const rooms = ((roomsData ?? []) as unknown) as RoomListRow[];
  const roomIds = rooms.map((room) => room.id);
  const playerCounts: Record<string, number> = {};

  if (roomIds.length > 0) {
    const { data: playerData } = await db
      .from(tables.players)
      .select('room_id')
      .in('room_id', roomIds);

    if (playerData) {
      for (const player of playerData as PlayerRoomRef[]) {
        playerCounts[player.room_id] = (playerCounts[player.room_id] || 0) + 1;
      }
    }
  }

  return json({
    rooms: rooms.map((room) => ({
      ...room,
      player_count: playerCounts[room.id] || 0,
    })),
  });
}
