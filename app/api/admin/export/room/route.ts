import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

type PostgrestErrorLike = { message?: string; code?: string } | null;

function isMissingTableError(error: PostgrestErrorLike) {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return code === '42P01' || /relation .* does not exist/i.test(message);
}

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const roomId = url.searchParams.get('roomId') ?? url.searchParams.get('room_id');
  const code = url.searchParams.get('code');

  if (!roomId && !code) {
    return Response.json({ error: 'Provide roomId or code' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const roomQuery = supabase.from('rooms').select('*');
  const roomRes = roomId ? await roomQuery.eq('id', roomId).maybeSingle() : await roomQuery.eq('code', code!).maybeSingle();

  if (roomRes.error) {
    return Response.json({ error: roomRes.error.message ?? 'Failed to load room' }, { status: 500 });
  }
  if (!roomRes.data) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const resolvedRoomId = (roomRes.data as { id: string }).id;
  const resolvedCode = (roomRes.data as { code?: string }).code ?? 'room';

  const loadAllMaybe = async (table: string, limit: number) => {
    const res = await supabase.from(table).select('*').eq('room_id', resolvedRoomId).limit(limit);
    if (res.error && isMissingTableError(res.error as PostgrestErrorLike)) return [];
    if (res.error) throw res.error;
    return res.data ?? [];
  };

  try {
    const [
      players,
      answers,
      round2_answers,
      round3_answers,
      round3_votes,
      round4_answers,
      round5_answers,
      question_likes,
      logs,
      game_results,
    ] = await Promise.all([
      loadAllMaybe('players', 20000),
      loadAllMaybe('answers', 50000),
      loadAllMaybe('round2_answers', 50000),
      loadAllMaybe('round3_answers', 50000),
      loadAllMaybe('round3_votes', 50000),
      loadAllMaybe('round4_answers', 50000),
      loadAllMaybe('round5_answers', 50000),
      loadAllMaybe('question_likes', 50000),
      loadAllMaybe('logs', 20000),
      loadAllMaybe('game_results', 50000),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      room: roomRes.data,
      players,
      answers,
      round2_answers,
      round3_answers,
      round3_votes,
      round4_answers,
      round5_answers,
      question_likes,
      logs,
      game_results,
    };

    const filename = `room-${String(resolvedCode).replace(/[^a-zA-Z0-9_-]/g, '') || 'export'}.json`;

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e: unknown) {
    const message = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Failed to export room';
    return Response.json({ error: message }, { status: 500 });
  }
}
