import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db.server';
import {
  applyPromoDiscount,
  buildPromoLabel,
  FALLBACK_GAME_PRICES,
  normalizePromoCode,
  type PromoCodeRow,
  type SupportedPaidGame,
} from '@/lib/payments/pricing';
import { json, jsonError } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_GAMES = new Set<SupportedPaidGame>(['vecherinkach', 'jokester', 'creativach', 'draw']);
const PACK_TABLE_BY_GAME: Record<SupportedPaidGame, string> = {
  vecherinkach: 'question_packs',
  jokester: 'jokester_question_packs',
  creativach: 'question_packs',
  draw: 'draw_packs',
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count += 1;
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return jsonError('Слишком много попыток, подождите минуту', 429, { valid: false });
  }

  let body: { code?: string; game?: string; pack_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid request', 400, { valid: false });
  }

  const { code, game, pack_id } = body;
  if (!code || !game || !pack_id || !SUPPORTED_GAMES.has(game as SupportedPaidGame)) {
    return json({ valid: false, error: 'Промокод недействителен' });
  }

  const normalizedGame = game as SupportedPaidGame;
  const normalizedCode = normalizePromoCode(code);

  const [promoData, packData, gamePrice] = await Promise.all([
    queryOne<PromoCodeRow>(
      `select id, discount_pct, discount_fixed, used_count, max_uses, expires_at, game, pack_id
       from promo_codes
       where code = $1 and is_active = true`,
      [normalizedCode],
    ),
    queryOne<{ price: number | null }>(
      `select price
       from ${PACK_TABLE_BY_GAME[normalizedGame]}
       where id = $1`,
      [pack_id],
    ),
    queryOne<{ price: number }>(
      `select price
       from game_prices
       where game = $1`,
      [normalizedGame],
    ),
  ]);

  if (!promoData) {
    return json({ valid: false, error: 'Промокод недействителен' });
  }
  if (promoData.expires_at && new Date(promoData.expires_at) <= new Date()) {
    return json({ valid: false, error: 'Срок действия промокода истёк' });
  }
  if (promoData.max_uses !== null && promoData.used_count >= promoData.max_uses) {
    return json({ valid: false, error: 'Промокод уже использован максимальное количество раз' });
  }
  if (promoData.game && promoData.game !== normalizedGame) {
    return json({ valid: false, error: 'Промокод недействителен для этой игры' });
  }
  if (promoData.pack_id && promoData.pack_id !== pack_id) {
    return json({ valid: false, error: 'Промокод недействителен для этого пакета' });
  }

  const basePrice = packData?.price ?? gamePrice?.price ?? FALLBACK_GAME_PRICES[normalizedGame];
  const finalPrice = applyPromoDiscount(basePrice, promoData);

  return json({
    valid: true,
    discount_pct: promoData.discount_pct,
    discount_fixed: promoData.discount_fixed,
    final_price: finalPrice,
    label: buildPromoLabel(promoData, finalPrice),
  });
}
