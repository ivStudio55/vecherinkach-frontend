import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = Math.max(1, Math.min(Number(limitParam ?? 10) || 10, 50));

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('get_top_liked_questions', { p_limit: limit });

  if (!error) {
    return Response.json({ items: data ?? [] });
  }

  const { data: rows, error: rowsError } = await supabase
    .from('question_likes')
    .select('question_id');

  if (rowsError) {
    return Response.json({ error: rowsError.message ?? 'Failed to load likes' }, { status: 500 });
  }

  const counts = new Map<number, number>();
  (rows ?? []).forEach((row) => {
    const id = Number((row as { question_id?: unknown }).question_id ?? NaN);
    if (!Number.isFinite(id)) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });

  const items = Array.from(counts.entries())
    .map(([question_id, likes]) => ({ question_id, likes }))
    .sort((a, b) => b.likes - a.likes || a.question_id - b.question_id)
    .slice(0, limit);

  return Response.json({ items });
}
