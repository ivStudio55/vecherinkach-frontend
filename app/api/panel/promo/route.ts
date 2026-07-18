import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';
import { PANEL_PROMO_FIELDS } from '@/lib/panel/config';
import { json, jsonError } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('promo_codes')
    .select(PANEL_PROMO_FIELDS)
    .order('created_at', { ascending: false });

  if (error) return jsonError(error.message, 500);
  return json(data ?? []);
}

export async function POST(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const code = String(body.code || '').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');

  if (!code || code.length < 2 || code.length > 32) {
    return jsonError('Код: 2-32 символа (A-Z, 0-9, _, -)', 400);
  }

  const discount_pct = Number(body.discount_pct ?? 0);
  const discount_fixed = Number(body.discount_fixed ?? 0);

  if (discount_pct < 0 || discount_pct > 100) {
    return jsonError('discount_pct: 0–100', 400);
  }
  if (discount_pct === 0 && discount_fixed === 0) {
    return jsonError('Укажите скидку (% или фиксированную)', 400);
  }

  const supabase = getSupabaseAdminClient();
  const row = {
    code,
    discount_pct,
    discount_fixed,
    game: body.game || null,
    pack_id: body.pack_id || null,
    expires_at: body.expires_at || null,
    max_uses: body.max_uses ? Number(body.max_uses) : null,
    is_active: true,
  };

  const { data, error } = await supabase
    .from('promo_codes')
    .insert(row)
    .select(PANEL_PROMO_FIELDS)
    .single();

  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return jsonError('Промокод с таким кодом уже существует', 409);
    }
    return jsonError(error.message, 500);
  }

  return json({ ok: true, promo: data });
}

export async function PUT(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const id = body.id;
  if (!id) return jsonError('id обязателен', 400);

  const updates: Record<string, unknown> = {};
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
  if (body.discount_pct !== undefined) updates.discount_pct = Number(body.discount_pct);
  if (body.discount_fixed !== undefined) updates.discount_fixed = Number(body.discount_fixed);
  if (body.game !== undefined) updates.game = body.game || null;
  if (body.pack_id !== undefined) updates.pack_id = body.pack_id || null;
  if (body.expires_at !== undefined) updates.expires_at = body.expires_at || null;
  if (body.max_uses !== undefined) updates.max_uses = body.max_uses ? Number(body.max_uses) : null;
  if (body.reset_used_count) updates.used_count = 0;

  if (Object.keys(updates).length === 0) {
    return jsonError('Нет полей для обновления', 400);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('promo_codes')
    .update(updates)
    .eq('id', id)
    .select(PANEL_PROMO_FIELDS)
    .single();

  if (error) return jsonError(error.message, 500);
  return json({ ok: true, promo: data });
}

export async function DELETE(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonError('id обязателен', 400);

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('promo_codes').delete().eq('id', id);
  if (error) return jsonError(error.message, 500);
  return json({ ok: true });
}
