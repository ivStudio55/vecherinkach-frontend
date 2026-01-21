import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

type PostgrestErrorLike = { message?: string; code?: string } | null;

function isMissingTableError(error: PostgrestErrorLike) {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return code === '42P01' || /relation .* does not exist/i.test(message);
}

export async function POST(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = (body?.code ?? '').toString().trim();
  if (!/^\d{4}$/.test(code)) {
    return Response.json({ error: 'Invalid room code' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, code')
    .eq('code', code)
    .maybeSingle();

  if (roomError) {
    return Response.json({ error: roomError.message ?? 'Failed to load room' }, { status: 500 });
  }
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const roomId = room.id as string;
  const results: Record<string, number> = {};

  const deleteFrom = async (table: string) => {
    const { error } = await supabase.from(table).delete().eq('room_id', roomId);
    if (error) {
      if (isMissingTableError(error as PostgrestErrorLike)) {
        results[table] = 0;
        return null;
      }
      return Response.json({ error: `Failed to delete from ${table}: ${error.message ?? ''}` }, { status: 500 });
    }
    results[table] = 0;
    return null;
  };

  // Order matters if FK constraints do not cascade.
  for (const table of [
    'round2_answers',
    'answers',
    'round3_votes',
    'round3_answers',
    'round4_answers',
    'round5_answers',
    'question_likes',
    'logs',
    'game_results',
    'players',
  ]) {
    const fail = await deleteFrom(table);
    if (fail) return fail;
  }

  const { error: deleteRoomError } = await supabase.from('rooms').delete().eq('id', roomId);
  if (deleteRoomError) {
    return Response.json({ error: deleteRoomError.message ?? 'Failed to delete room' }, { status: 500 });
  }

  results.rooms = 1;

  return Response.json({ ok: true, code, roomId, deleted: results });
}
