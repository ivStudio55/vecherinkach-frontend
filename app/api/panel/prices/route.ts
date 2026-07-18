import { requirePanelAuth } from '@/lib/panelAuth';
import { query, queryOne } from '@/lib/db.server';
import { FALLBACK_GAME_PRICES } from '@/lib/payments/pricing';
import { json, jsonError } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GamePriceRow = {
  game: keyof typeof FALLBACK_GAME_PRICES;
  price: number;
  updated_at: string | null;
};

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  try {
    const data = await query<GamePriceRow>(
      `select game, price, updated_at
       from game_prices
       order by game asc`
    );
    const result = { ...FALLBACK_GAME_PRICES };
    for (const row of data) {
      result[row.game] = row.price;
    }
    return json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to load prices', 500);
  }
}

export async function PUT(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const game = String(body.game || '').trim();
  const price = Number(body.price);

  if (!game || !(game in FALLBACK_GAME_PRICES)) {
    return jsonError('Неизвестная игра', 400);
  }
  if (!Number.isInteger(price) || price < 0 || price > 100000) {
    return jsonError('Цена: целое число 0–100000', 400);
  }

  try {
    const data = await queryOne<GamePriceRow>(
      `insert into game_prices (game, price, updated_at)
       values ($1, $2, $3)
       on conflict (game)
       do update set
         price = excluded.price,
         updated_at = excluded.updated_at
       returning game, price, updated_at`,
      [game, price, new Date().toISOString()],
    );
    return json({ ok: true, row: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to update price', 500);
  }
}
