import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const payload = (await request.json().catch(() => null)) as { roomId?: string } | null;
  const roomId = payload?.roomId;
  if (!roomId) {
    return Response.json({ error: 'roomId is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('rooms')
    .update({
      all_players_answered: true,
      transitioning_to_next: false,
    })
    .eq('id', roomId)
    .select('id, code, status, all_players_answered')
    .single();

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to force end round' }, { status: 500 });
  }

  return Response.json({ ok: true, room: data });
}
