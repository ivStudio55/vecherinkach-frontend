import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

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
    .select('id, code, status, is_active')
    .eq('code', code)
    .maybeSingle();

  if (roomError) {
    return Response.json({ error: roomError.message ?? 'Failed to load room' }, { status: 500 });
  }
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from('rooms')
    .update({ is_active: false, status: 'finished', question_started_at: null })
    .eq('id', room.id);

  if (updateError) {
    return Response.json({ error: updateError.message ?? 'Failed to close room' }, { status: 500 });
  }

  return Response.json({ ok: true, roomId: room.id, code });
}
