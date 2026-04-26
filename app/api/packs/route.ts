import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    const url = new URL(request.url);
    const includeId = url.searchParams.get('include');

    let query = supabase
      .from('question_packs')
      .select('id, label, description, is_public, json_base_url, audio_round2_start, audio_round2_end, audio_round3_start, audio_round5_start')
      .eq('is_active', true)
      .eq('is_public', true)
      .order('created_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const result = data ?? [];

    // ?include= only works for public packs (private packs are loaded via /api/packs/room/[roomId])
    if (includeId && !result.some(p => p.id === includeId)) {
      const { data: extra } = await supabase
        .from('question_packs')
        .select('id, label, description, is_public, json_base_url, audio_round2_start, audio_round2_end, audio_round3_start, audio_round5_start')
        .eq('id', includeId)
        .eq('is_active', true)
        .eq('is_public', true)
        .single();
      if (extra) result.push(extra);
    }

    return Response.json(result, {
      headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
