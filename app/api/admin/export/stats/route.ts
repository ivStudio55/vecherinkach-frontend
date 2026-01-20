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
  const [roomsTotal, playersTotal, roomsInRange, playersInRange] = await Promise.all([
    supabase.from('rooms').select('id', { count: 'exact', head: true }),
    supabase.from('players').select('id', { count: 'exact', head: true }),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).gte('created_at', range.startIso).lt('created_at', range.endIso),
    supabase.from('players').select('id', { count: 'exact', head: true }).gte('joined_at', range.startIso).lt('joined_at', range.endIso),
  ]);

  const rows = [
    ['metric', 'value'],
    ['rooms_total', roomsTotal.count ?? 0],
    ['players_total', playersTotal.count ?? 0],
    ['rooms_in_range', roomsInRange.count ?? 0],
    ['players_in_range', playersInRange.count ?? 0],
    ['range_start', range.startIso],
    ['range_end', range.endIso],
  ];

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="stats-export.csv"',
    },
  });
}
