import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';
import { PANEL_JOKESTER_PACK_FIELDS } from '@/lib/panel/config';
import { json, jsonError } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JSON_CDN_BASE = 'https://storage.yandexcloud.net/vecherinkach/json';

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('jokester_question_packs')
    .select(PANEL_JOKESTER_PACK_FIELDS)
    .order('created_at', { ascending: true });

  if (error) return jsonError(error.message, 500);
  return json(data ?? []);
}

export async function POST(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const id = String(body.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const label = String(body.label || '').trim();

  if (!id || id.length < 2 || id.length > 50) {
    return jsonError('ID пакета: 2-50 символов (a-z, 0-9, _, -)', 400);
  }
  if (!label) {
    return jsonError('Название обязательно', 400);
  }

  const supabase = getSupabaseAdminClient();
  const packData = {
    id,
    label,
    description: String(body.description || ''),
    is_public: body.is_public === true,
    is_active: true,
    json_url: body.json_url || `${JSON_CDN_BASE}/jokester_questions_pack/${id}/jokester_questions.json`,
    price: body.price === null || body.price === '' || body.price === undefined ? null : Number(body.price),
  };

  const { data, error } = await supabase
    .from('jokester_question_packs')
    .insert(packData)
    .select(PANEL_JOKESTER_PACK_FIELDS)
    .single();

  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return jsonError('Пакет с таким ID уже существует', 409);
    }
    return jsonError(error.message, 500);
  }

  return json({ ok: true, pack: data });
}

export async function PUT(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const id = String(body.id || '').trim();
  if (!id) return jsonError('ID обязателен', 400);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) updates.label = String(body.label).trim();
  if (body.description !== undefined) updates.description = String(body.description);
  if (body.is_public !== undefined) updates.is_public = body.is_public === true;
  if (body.is_active !== undefined) updates.is_active = body.is_active === true;
  if (body.json_url !== undefined) updates.json_url = String(body.json_url);
  if ('price' in body) updates.price = body.price === null || body.price === '' ? null : Number(body.price);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('jokester_question_packs')
    .update(updates)
    .eq('id', id)
    .select(PANEL_JOKESTER_PACK_FIELDS)
    .single();

  if (error) return jsonError(error.message, 500);
  return json({ ok: true, pack: data });
}

export async function DELETE(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonError('ID обязателен', 400);
  if (id === 'classic') return jsonError('Нельзя удалить классический пакет', 400);

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('jokester_question_packs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return jsonError(error.message, 500);
  return json({ ok: true });
}
