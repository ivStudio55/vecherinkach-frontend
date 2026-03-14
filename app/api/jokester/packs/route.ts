import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — list active public jokester packs (+ specific pack by id)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const packId = url.searchParams.get('id');

  const supabase = getSupabaseAdminClient();

  if (packId) {
    // Fetch specific pack by id (must be active)
    const { data, error } = await supabase
      .from('jokester_question_packs')
      .select('id, label, description, is_public, json_url')
      .eq('id', packId)
      .eq('is_active', true)
      .single();

    if (error || !data) return Response.json({ error: 'Пакет не найден' }, { status: 404 });
    return Response.json(data);
  }

  // List all active public packs
  const { data, error } = await supabase
    .from('jokester_question_packs')
    .select('id, label, description, json_url')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('created_at', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}
