import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — list all promo codes
export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

// POST — create promo code
export async function POST(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const code = String(body.code || '').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');

  if (!code || code.length < 2 || code.length > 32) {
    return Response.json({ error: 'Код: 2-32 символа (A-Z, 0-9, _, -)' }, { status: 400 });
  }

  const discount_pct = Number(body.discount_pct ?? 0);
  const discount_fixed = Number(body.discount_fixed ?? 0);

  if (discount_pct < 0 || discount_pct > 100) {
    return Response.json({ error: 'discount_pct: 0–100' }, { status: 400 });
  }
  if (discount_pct === 0 && discount_fixed === 0) {
    return Response.json({ error: 'Укажите скидку (% или фиксированную)' }, { status: 400 });
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

  const { data, error } = await supabase.from('promo_codes').insert(row).select().single();
  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return Response.json({ error: 'Промокод с таким кодом уже существует' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, promo: data });
}

// PUT — update promo code (toggle active, update fields)
export async function PUT(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const id = body.id;
  if (!id) return Response.json({ error: 'id обязателен' }, { status: 400 });

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
    return Response.json({ error: 'Нет полей для обновления' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('promo_codes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, promo: data });
}

// DELETE — delete promo code
export async function DELETE(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id обязателен' }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('promo_codes').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
