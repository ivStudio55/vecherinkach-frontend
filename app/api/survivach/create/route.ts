// app/api/survivach/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requirePanelAuth } from '@/lib/panelAuth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function generateCode(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const auth = requirePanelAuth(request);
  if (auth) return auth;

  const body = await request.json().catch(() => ({}));
  const packId: string = body.pack_id ?? 'default';

  const code = generateCode();

  const { data: room, error: roomError } = await supabase
    .from('survivach_rooms')
    .insert({
      code,
      pack_id: packId,
      status: 'lobby',
      current_round: 0,
      leader_position: 1,
      zombie_bomb_active: false,
      state_version: 1,
    })
    .select()
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: roomError?.message ?? 'Failed to create room' }, { status: 500 });
  }

  // Create host player
  const { error: playerError } = await supabase
    .from('survivach_players')
    .insert({
      room_id: room.id,
      name: 'Ведущий',
      avatar: 'host',
      is_host: true,
      position: 0,
      lives: 3,
      karma: 0,
      is_zombie: false,
      correct_streak: 0,
    });

  if (playerError) {
    console.error('Failed to create host player:', playerError.message);
  }

  return NextResponse.json({
    roomId: room.id,
    code: room.code,
    hostUrl: `/survivach/host/${room.code}`,
    joinUrl: `/survivach/room/${room.code}`,
  });
}
