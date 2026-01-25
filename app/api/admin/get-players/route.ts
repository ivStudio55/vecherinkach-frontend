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
  const { data: players, error } = await supabase
    .from('players')
    .select('id, name, total_points, joined_at, room_id')
    .eq('room_id', roomId)
    .order('total_points', { ascending: false });

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to load players' }, { status: 500 });
  }

  return Response.json({ items: players ?? [] });
}
