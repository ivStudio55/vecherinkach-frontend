import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — list all categories
export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('round4_categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

// POST — create new category
export async function POST(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const name = String(body.name || '').trim();
  const folder_key = String(body.folder_key || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const audio_variants = Math.max(1, Math.min(20, Number(body.audio_variants) || 3));

  if (!name || name.length < 2) {
    return Response.json({ error: 'Название категории: минимум 2 символа' }, { status: 400 });
  }
  if (!folder_key || folder_key.length < 2) {
    return Response.json({ error: 'Ключ папки: минимум 2 символа (латиница, цифры, _, -)' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('round4_categories')
    .insert({ name, folder_key, audio_variants, is_active: true })
    .select()
    .single();

  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return Response.json({ error: 'Категория с таким названием или ключом уже существует' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, category: data });
}

// PUT — update category
export async function PUT(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const id = String(body.id || '').trim();
  if (!id) return Response.json({ error: 'ID обязателен' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) return Response.json({ error: 'Название: минимум 2 символа' }, { status: 400 });
    updates.name = name;
  }
  if (body.folder_key !== undefined) {
    const fk = String(body.folder_key).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (fk.length < 2) return Response.json({ error: 'Ключ папки: минимум 2 символа' }, { status: 400 });
    updates.folder_key = fk;
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
    .select()
    .single();

  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return Response.json({ error: 'Категория с таким названием или ключом уже существует' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, category: data });
}

// DELETE — remove category
export async function DELETE(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'ID обязателен' }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('round4_categories')
    .delete()
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
