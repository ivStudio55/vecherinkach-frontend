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

function parseLimit(url: URL) {
  const raw = url.searchParams.get('limit');
  if (!raw) return 10;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'total';
  const range = parseRange(url);
  const limit = parseLimit(url);

  if (!range) {
    return Response.json({ error: 'Invalid range. Provide start and end as ISO strings.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  if (type === 'total') {
    const { data, error } = await supabase
      .from('players')
      .select('id, name, total_points, joined_at')
      .gte('joined_at', range.startIso)
      .lt('joined_at', range.endIso)
      .order('total_points', { ascending: false })
      .limit(limit);

    if (error) {
      return Response.json({ error: error.message ?? 'Failed to load leaderboard' }, { status: 500 });
    }

    return Response.json({
      type,
      range,
      items: (data ?? []).map((row) => {
        const meta = row as { total_points?: unknown; joined_at?: unknown };
        return {
          playerId: row.id,
          name: row.name,
          points: Number(meta.total_points ?? 0),
          joinedAt: meta.joined_at,
        };
      }),
    });
  }

  if (type === 'round2') {
    const { data, error } = await supabase
      .from('round2_answers')
      .select('player_id, points_earned, submitted_at')
      .gte('submitted_at', range.startIso)
      .lt('submitted_at', range.endIso)
      .limit(50000);

    if (error) {
      return Response.json({ error: error.message ?? 'Failed to load round2 answers' }, { status: 500 });
    }

    const pointsByPlayer = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ player_id: string; points_earned: number | null }>) {
      const id = row.player_id;
      const points = Number(row.points_earned ?? 0);
      pointsByPlayer.set(id, (pointsByPlayer.get(id) ?? 0) + points);
    }

    const ranked = Array.from(pointsByPlayer.entries())
      .map(([playerId, points]) => ({ playerId, points }))
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);

    const ids = ranked.map((r) => r.playerId);
    let nameById = new Map<string, string>();
    if (ids.length) {
      const { data: players, error: playersError } = await supabase
        .from('players')
        .select('id, name')
        .in('id', ids);
      if (playersError) {
        return Response.json({ error: playersError.message ?? 'Failed to load player names' }, { status: 500 });
      }
      nameById = new Map(
        (players ?? []).map((p) => {
          const meta = p as { id?: unknown; name?: unknown };
          return [String(meta.id ?? ''), String(meta.name ?? '')];
        })
      );
    }

    return Response.json({
      type,
      range,
      note: 'Сумма очков только по round2_answers (points_earned) в периоде.',
      items: ranked.map((r) => ({
        playerId: r.playerId,
        name: nameById.get(r.playerId) ?? '—',
        points: r.points,
      })),
    });
  }

  return Response.json({ error: 'Unknown leaderboard type' }, { status: 400 });
}
