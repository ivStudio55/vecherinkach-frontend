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
  const range = parseRange(url);
  if (!range) {
    return Response.json({ error: 'Invalid range. Provide start and end as ISO strings.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('players')
    .select('id, name, total_points, joined_at, room_id')
    .gte('joined_at', range.startIso)
    .lt('joined_at', range.endIso)
    .order('joined_at', { ascending: false })
    .limit(20000);

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to export players' }, { status: 500 });
  }

  const headers = ['id', 'name', 'total_points', 'joined_at', 'room_id'];
  const lines = [headers.join(',')];
  (data ?? []).forEach((row) => {
    const line = headers
      .map((key) => String((row as Record<string, unknown>)[key] ?? '').replace(/"/g, '""'))
      .map((value) => `"${value}"`)
      .join(',');
    lines.push(line);
  });

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="players-export.csv"',
    },
  });
}
