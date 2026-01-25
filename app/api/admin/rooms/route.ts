import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

function parseRange(url: URL) {
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);

  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const limitRaw = Number(url.searchParams.get('limit') ?? '50') || 50;
  const limit = Math.min(200, Math.max(1, limitRaw));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const status = url.searchParams.get('status');
  const code = url.searchParams.get('code');
  const packId = url.searchParams.get('packId') ?? url.searchParams.get('pack_id');
  const isActiveParam = url.searchParams.get('isActive') ?? url.searchParams.get('is_active');
  const range = parseRange(url);

  const supabase = getSupabaseAdminClient();

  // Note: players(count) works only if a FK relationship rooms -> players exists in PostgREST.
  // We attempt it first, and fallback to a simpler query if PostgREST doesn't expose the relationship.
  const selectWithPlayers =
    'id, code, status, is_active, created_at, pack_id, state_version, transitioning_to_next, current_question_index, question_started_at, players(count)';
  const selectWithoutPlayers =
    'id, code, status, is_active, created_at, pack_id, state_version, transitioning_to_next, current_question_index, question_started_at';

  let query = supabase
    .from('rooms')
    .select(selectWithPlayers, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);
  if (packId) query = query.eq('pack_id', packId);
  if (code) query = query.ilike('code', `%${code}%`);
  if (isActiveParam === 'true') query = query.eq('is_active', true);
  if (isActiveParam === 'false') query = query.eq('is_active', false);
  if (range) query = query.gte('created_at', range.startIso).lt('created_at', range.endIso);

  const first = await query;
  let data: unknown[] | null = (first.data ?? null) as unknown[] | null;
  let error = first.error;
  let count: number | null = first.count ?? null;

  if (error) {
    // Retry without players(count)
    let fallback = supabase
      .from('rooms')
      .select(selectWithoutPlayers, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) fallback = fallback.eq('status', status);
    if (packId) fallback = fallback.eq('pack_id', packId);
    if (code) fallback = fallback.ilike('code', `%${code}%`);
    if (isActiveParam === 'true') fallback = fallback.eq('is_active', true);
    if (isActiveParam === 'false') fallback = fallback.eq('is_active', false);
    if (range) fallback = fallback.gte('created_at', range.startIso).lt('created_at', range.endIso);

    const second = await fallback;
    data = (second.data ?? null) as unknown[] | null;
    count = second.count ?? null;
    error = second.error;
  }

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to load rooms' }, { status: 500 });
  }

  return Response.json({
    items: (data ?? []).map((row) => {
      const meta = row as unknown as {
        status?: unknown;
        is_active?: unknown;
        created_at?: unknown;
        pack_id?: unknown;
        state_version?: unknown;
        transitioning_to_next?: unknown;
        current_question_index?: unknown;
        question_started_at?: unknown;
        players?: Array<{ count?: number }>;
      };

      const playersCount = Array.isArray(meta.players) ? Number(meta.players[0]?.count ?? 0) : null;

      const base = row as { id?: string; code?: string };
      const id = base.id ?? null;
      if (!id) console.error('Missing ID for room row:', row);

      return {
        id: id ?? 'missing-id',
        code: base.code ?? 'NO_CODE',
        status: meta.status ?? null,
        isActive: meta.is_active ?? null,
        createdAt: meta.created_at ?? null,
        packId: meta.pack_id ?? null,
        stateVersion: meta.state_version ?? null,
        transitioningToNext: meta.transitioning_to_next ?? null,
        currentQuestionIndex: meta.current_question_index ?? null,
        questionStartedAt: meta.question_started_at ?? null,
        playersCount,
      };
    }),
    total: count ?? 0,
    page,
    pageSize: limit,
  });
}
