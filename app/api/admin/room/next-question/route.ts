import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RoomRow = {
  id: string;
  current_question_index?: number | null;
  selected_question_ids?: unknown;
};

type PostgrestErrorLike = { message?: string } | null;

export async function POST(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const payload = (await request.json().catch(() => null)) as { roomId?: string } | null;
  const roomId = payload?.roomId;
  if (!roomId) {
    return Response.json({ error: 'roomId is required' }, { status: 400 });
  }
  if (!uuidRegex.test(roomId)) {
    return Response.json({ error: 'Invalid roomId UUID' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, status, current_question_index, selected_question_ids')
    .eq('id', roomId)
    .maybeSingle();

  if (roomError) {
    const message = (roomError as PostgrestErrorLike)?.message ?? 'Failed to load room';
    return Response.json({ error: message }, { status: 500 });
  }
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const selectedIdsRaw = (room as RoomRow).selected_question_ids;
  const selectedIds = Array.isArray(selectedIdsRaw)
    ? (selectedIdsRaw as Array<number | string>)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    : [];

  if (!selectedIds.length) {
    return Response.json({ error: 'У комнаты нет выбранных вопросов для переключения' }, { status: 400 });
  }

  const currentIndex = Number((room as RoomRow).current_question_index ?? 0);
  const nextIndex = currentIndex + 1;
  if (nextIndex >= selectedIds.length) {
    return Response.json({ error: 'Следующего вопроса нет: достигнут конец списка' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: updatedRoom, error: updateError } = await supabase
    .from('rooms')
    .update({
      current_question_index: nextIndex,
      question_started_at: now,
      all_players_answered: false,
      transitioning_to_next: false,
    })
    .eq('id', roomId)
    .select('id, code, status, current_question_index, question_started_at')
    .single();

  if (updateError) {
    const message = (updateError as PostgrestErrorLike)?.message ?? 'Failed to move to next question';
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ ok: true, room: updatedRoom, nextIndex, total: selectedIds.length });
}
