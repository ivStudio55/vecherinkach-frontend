import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { queryOne } from '@/lib/db.server';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
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

  const room = await queryOne<{ id: string; code: string }>(
    'select id, code from rooms where id = $1',
    [roomId],
  );

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (roomCode && room.code !== roomCode) {
    return NextResponse.json({ error: 'Room code mismatch' }, { status: 403 });
  }

  if (playerId) {
    const player = await queryOne<{ id: string; room_id: string }>(
      'select id, room_id from players where id = $1 and room_id = $2',
      [playerId, roomId],
    );
    if (!player) {
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
