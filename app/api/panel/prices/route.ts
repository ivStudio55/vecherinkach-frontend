import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK_PRICES: Record<string, number> = {
  vecherinkach: 300,
  jokester: 200,
  creativach: 200,
};

// GET — list all game prices
export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('game_prices')
    .select('*')
    .order('game');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Ensure all games are present (fill missing with fallback)
  const result = { ...FALLBACK_PRICES };
  for (const row of data ?? []) {
    result[row.game] = row.price;
  }

  return Response.json(result);
}

// PUT — update game price
export async function PUT(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const game = String(body.game || '').trim();
  const price = Number(body.price);

  if (!game || !FALLBACK_PRICES.hasOwnProperty(game)) {
    return Response.json({ error: 'Неизвестная игра' }, { status: 400 });
  }
  if (!Number.isInteger(price) || price < 0 || price > 100000) {
    return Response.json({ error: 'Цена: целое число 0–100000' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('game_prices')
    .upsert({ game, price, updated_at: new Date().toISOString() }, { onConflict: 'game' })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, row: data });
}
