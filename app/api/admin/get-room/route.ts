import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const roomId = url.searchParams.get('roomId');
  if (!roomId) {
    return Response.json({ error: 'roomId is required' }, { status: 400 });
  }
  if (!uuidRegex.test(roomId)) {
    return Response.json({ error: 'Invalid roomId' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: room, error } = await supabase.from('rooms').select('id, code, status, is_active, created_at, pack_id, state_version, transitioning_to_next, current_question_index, question_started_at, all_players_answered, selected_question_ids, round2_item_index, round2_showing_fact, round2_phase').eq('id', roomId).maybeSingle();

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to load room' }, { status: 500 });
  }
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  return Response.json({ room });
}
