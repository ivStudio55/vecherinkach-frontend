import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isMissingColumnError = (error: { code?: string; message?: string } | null) => {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return code === '42703' || /column .* does not exist/i.test(message);
};

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
  const loadLogs = async (withPlayerName: boolean) =>
    supabase
      .from('logs')
      .select(
        withPlayerName
          ? 'id, created_at, level, channel, message, event_name, player_id, player_name, context'
          : 'id, created_at, level, channel, message, event_name, player_id, context'
      )
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(200);

  const initial = await loadLogs(true);
  if (initial.error && isMissingColumnError(initial.error)) {
    const fallback = await loadLogs(false);
    if (fallback.error) {
      return Response.json({ error: fallback.error.message ?? 'Failed to load logs' }, { status: 500 });
    }
    return Response.json({ items: fallback.data ?? [] });
  }

  if (initial.error) {
    return Response.json({ error: initial.error.message ?? 'Failed to load logs' }, { status: 500 });
  }

  return Response.json({ items: initial.data ?? [] });
}
