import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';
import { PANEL_ROUND4_CATEGORY_FIELDS } from '@/lib/panel/config';
import { json, jsonError } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('round4_categories')
    .select(PANEL_ROUND4_CATEGORY_FIELDS)
    .order('name', { ascending: true });

  if (error) return jsonError(error.message, 500);
  return json(data ?? []);
}

export async function POST(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const name = String(body.name || '').trim();
  const folder_key = String(body.folder_key || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const audio_variants = Math.max(1, Math.min(20, Number(body.audio_variants) || 3));

  if (!name || name.length < 2) {
    return jsonError('Название категории: минимум 2 символа', 400);
  }
  if (!folder_key || folder_key.length < 2) {
    return jsonError('Ключ папки: минимум 2 символа (латиница, цифры, _, -)', 400);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('round4_categories')
    .insert({ name, folder_key, audio_variants, is_active: true })
    .select(PANEL_ROUND4_CATEGORY_FIELDS)
    .single();

  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return jsonError('Категория с таким названием или ключом уже существует', 409);
    }
    return jsonError(error.message, 500);
  }

  return json({ ok: true, category: data });
}

export async function PUT(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const id = String(body.id || '').trim();
  if (!id) return jsonError('ID обязателен', 400);

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) return jsonError('Название: минимум 2 символа', 400);
    updates.name = name;
  }
  if (body.folder_key !== undefined) {
    const folderKey = String(body.folder_key).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (folderKey.length < 2) return jsonError('Ключ папки: минимум 2 символа', 400);
    updates.folder_key = folderKey;
  }
  if (body.audio_variants !== undefined) {
    updates.audio_variants = Math.max(1, Math.min(20, Number(body.audio_variants) || 3));
  }
  if (body.is_active !== undefined) {
    updates.is_active = body.is_active === true;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('round4_categories')
    .update(updates)
    .eq('id', id)
    .select(PANEL_ROUND4_CATEGORY_FIELDS)
    .single();

  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return jsonError('Категория с таким названием или ключом уже существует', 409);
    }
    return jsonError(error.message, 500);
  }

  return json({ ok: true, category: data });
}

export async function DELETE(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonError('ID обязателен', 400);

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('round4_categories')
    .delete()
    .eq('id', id);

  if (error) return jsonError(error.message, 500);
  return json({ ok: true });
}
