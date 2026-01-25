import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const body = (await request.json().catch(() => null)) as { roomId?: string } | null;
  const roomId = body?.roomId;
  if (!roomId) {
    return Response.json({ error: 'Provide roomId' }, { status: 400 });
  }
  if (!uuidRegex.test(roomId)) {
    return Response.json({ error: 'Invalid roomId UUID' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('start_round3', { p_room_id: roomId });

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to start round3' }, { status: 500 });
  }

  return Response.json({ data: Array.isArray(data) ? data[0] : data });
}
