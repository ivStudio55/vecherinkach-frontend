import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const { data, error } = await supabase
    .from('rooms')
    .update({
      status: 'waiting',
      is_active: true,
      current_question_index: 0,
      question_started_at: null,
      all_players_answered: false,
      selected_question_ids: null,
      round2_item_index: null,
      round2_showing_fact: true,
      round2_phase: 'idle',
      round4_puzzle_id: null,
      round5_question_index: null,
      transitioning_to_next: false,
    })
    .eq('id', roomId)
    .select('id, code, status')
    .single();

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to restart room' }, { status: 500 });
  }

  return Response.json({ ok: true, room: data });
}
