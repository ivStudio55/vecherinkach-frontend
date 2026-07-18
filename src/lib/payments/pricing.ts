import type { SupabaseClient } from '@supabase/supabase-js';

export type SupportedPaidGame = 'vecherinkach' | 'jokester' | 'creativach' | 'draw';

type GamePriceRow = {
  game: string;
  price: number;
};

type PackRow = {
  id: string;
  label: string;
  is_public: boolean;
  is_active: boolean;
  price: number | null;
};

export type PromoCodeRow = {
  id: string;
  discount_pct: number;
  discount_fixed: number;
  used_count: number;
  max_uses: number | null;
  expires_at: string | null;
  game: string | null;
  pack_id: string | null;
};

export const FALLBACK_GAME_PRICES: Record<SupportedPaidGame, number> = {
  vecherinkach: 300,
  jokester: 200,
  creativach: 200,
  draw: 200,
};

const PACK_TABLE_BY_GAME: Record<SupportedPaidGame, string> = {
  vecherinkach: 'question_packs',
  jokester: 'jokester_question_packs',
  creativach: 'question_packs',
  draw: 'draw_packs',
};

let priceCache: { prices: Record<string, number>; expiresAt: number } | null = null;

export function normalizePromoCode(code: string) {
  return code.toUpperCase().trim();
}

export async function getGamePrice(
  supabase: SupabaseClient,
  game: SupportedPaidGame,
): Promise<number> {
  const now = Date.now();
  if (!priceCache || priceCache.expiresAt < now) {
    try {
      const { data } = await supabase.from('game_prices').select('game, price');
      if (data && data.length > 0) {
        const prices: Record<string, number> = { ...FALLBACK_GAME_PRICES };
        for (const row of data as GamePriceRow[]) prices[row.game] = row.price;
        priceCache = { prices, expiresAt: now + 5 * 60 * 1000 };
      }
    } catch {
      // fall through to fallback prices
    }
  }

  return priceCache?.prices[game] ?? FALLBACK_GAME_PRICES[game];
}

export async function getPackRow(
  supabase: SupabaseClient,
  game: SupportedPaidGame,
  packId: string,
) {
  const table = PACK_TABLE_BY_GAME[game];
  const result = await supabase
    .from(table)
    .select('id, label, is_public, is_active, price')
    .eq('id', packId)
    .single<PackRow>();

  return { table, ...result };
}

export async function getBasePriceForPack(
  supabase: SupabaseClient,
  game: SupportedPaidGame,
  packPrice: number | null,
) {
  return packPrice != null ? packPrice : getGamePrice(supabase, game);
}

export async function getPromoCodeRow(
  supabase: SupabaseClient,
  code: string,
) {
  return supabase
    .from('promo_codes')
    .select('id, discount_pct, discount_fixed, used_count, max_uses, expires_at, game, pack_id')
    .eq('code', code)
    .eq('is_active', true)
    .single<PromoCodeRow>();
}

export function getPromoValidationError(
  promo: PromoCodeRow | null | undefined,
  game: SupportedPaidGame,
  packId: string,
  now = new Date(),
) {
  if (!promo) return 'Промокод недействителен';
  if (promo.expires_at && new Date(promo.expires_at) <= now) {
    return 'Срок действия промокода истёк';
  }
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
    return 'Промокод уже использован максимальное количество раз';
  }
  if (promo.game && promo.game !== game) {
    return 'Промокод недействителен для этой игры';
  }
  if (promo.pack_id && promo.pack_id !== packId) {
    return 'Промокод недействителен для этого пакета';
  }
  return null;
}

export function applyPromoDiscount(basePrice: number, promo: PromoCodeRow) {
  const afterPercent = Math.round(basePrice * (1 - promo.discount_pct / 100));
  return Math.max(0, afterPercent - (promo.discount_fixed ?? 0));
}

export function buildPromoLabel(promo: PromoCodeRow, finalPrice: number) {
  if (finalPrice === 0) return 'Бесплатно! 🎁';
  if (promo.discount_pct > 0 && promo.discount_fixed > 0) {
    return `Скидка ${promo.discount_pct}% + ${promo.discount_fixed} ₽ — итого ${finalPrice} ₽`;
  }
  if (promo.discount_pct > 0) {
    return `Скидка ${promo.discount_pct}% — итого ${finalPrice} ₽`;
  }
  return `Скидка ${promo.discount_fixed} ₽ — итого ${finalPrice} ₽`;
}
