import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
// На Supabase: 'authenticated'. На Timeweb (gen_user-only): 'gen_user'
const DB_JWT_ROLE = process.env.DB_JWT_ROLE ?? 'authenticated';

type RoomTokenPayload = { roomId?: string; roomCode?: string; playerId?: string };

const createRoomTokenResponse = async (payload: RoomTokenPayload) => {
  if (!JWT_SECRET) {
    return NextResponse.json({ error: 'SUPABASE_JWT_SECRET is not set' }, { status: 500 });
  }

  const roomId = payload.roomId?.trim();
  const roomCode = payload.roomCode?.trim();
  const playerId = payload.playerId?.trim();

  if (!roomId) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const roomQuery = admin.from('rooms').select('id, code').eq('id', roomId).single();
  const { data: room, error: roomError } = await roomQuery;

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (roomCode && room.code !== roomCode) {
    return NextResponse.json({ error: 'Room code mismatch' }, { status: 403 });
  }

  if (playerId) {
    const { data: player, error: playerError } = await admin
      .from('players')
      .select('id, room_id')
      .eq('id', playerId)
      .eq('room_id', roomId)
      .maybeSingle();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found in room' }, { status: 403 });
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      aud: DB_JWT_ROLE,
      exp: now + 60 * 60 * 24,
      iat: now,
      iss: 'supabase',
      role: DB_JWT_ROLE,
      room_id: room.id,
      room_code: room.code,
      player_id: playerId ?? null,
      sub: playerId ?? room.id,
    },
    JWT_SECRET
  );

  return NextResponse.json({ token });
};

export async function POST(request: Request) {
  let payload: RoomTokenPayload;
  try {
    payload = (await request.json()) as RoomTokenPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return createRoomTokenResponse(payload);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload: RoomTokenPayload = {
    roomId: url.searchParams.get('roomId') ?? undefined,
    roomCode: url.searchParams.get('roomCode') ?? undefined,
    playerId: url.searchParams.get('playerId') ?? undefined,
  };

  return createRoomTokenResponse(payload);
}
