import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK_PRICES: Record<string, number> = {
  vecherinkach: 300,
  jokester: 200,
  creativach: 200,
};

// 5-minute price cache (same pattern as payment/create)
let priceCache: { prices: Record<string, number>; expiresAt: number } | null = null;

async function getGamePrice(game: string): Promise<number> {
  const now = Date.now();
  if (!priceCache || priceCache.expiresAt < now) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data } = await supabase.from('game_prices').select('game, price');
      if (data && data.length > 0) {
        const prices: Record<string, number> = { ...FALLBACK_PRICES };
        for (const row of data) prices[row.game] = row.price;
        priceCache = { prices, expiresAt: now + 5 * 60 * 1000 };
      }
    } catch {
      // fall through to fallback
    }
  }
  return priceCache?.prices[game] ?? FALLBACK_PRICES[game] ?? 300;
}

// Simple in-memory rate limiting (10 requests per IP per minute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count++;
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ valid: false, error: 'Слишком много попыток, подождите минуту' }, { status: 429 });
  }

  let body: { code?: string; game?: string; pack_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false, error: 'Invalid request' }, { status: 400 });
  }

  const { code, game, pack_id } = body;
  if (!code || !game || !pack_id) {
    return NextResponse.json({ valid: false, error: 'Промокод недействителен' });
  }

  const normalizedCode = code.toUpperCase().trim();
  const supabase = getSupabaseAdminClient();

  const packTable = game === 'jokester' ? 'jokester_question_packs' : 'question_packs';
  const [{ data }, packRow, gameDefaultPrice] = await Promise.all([
    supabase
      .from('promo_codes')
      .select('discount_pct, discount_fixed, max_uses, used_count, expires_at, game, pack_id')
      .eq('code', normalizedCode)
      .eq('is_active', true)
      .single(),
    supabase.from(packTable).select('price').eq('id', pack_id).single(),
    getGamePrice(game),
  ]);

  const basePrice = (packRow.data?.price != null) ? packRow.data.price : gameDefaultPrice;

  if (!data) {
    return NextResponse.json({ valid: false, error: 'Промокод недействителен' });
  }

  if (data.expires_at && new Date(data.expires_at) <= new Date()) {
    return NextResponse.json({ valid: false, error: 'Срок действия промокода истёк' });
  }

  if (data.max_uses !== null && data.used_count >= data.max_uses) {
    return NextResponse.json({ valid: false, error: 'Промокод уже использован максимальное количество раз' });
  }

  if (data.game && data.game !== game) {
    return NextResponse.json({ valid: false, error: 'Промокод недействителен для этой игры' });
  }

  if (data.pack_id && data.pack_id !== pack_id) {
    return NextResponse.json({ valid: false, error: 'Промокод недействителен для этого пакета' });
  }

  const afterPct = Math.round(basePrice * (1 - data.discount_pct / 100));
  const finalPrice = Math.max(0, afterPct - data.discount_fixed);

  let label = '';
  if (finalPrice === 0) {
    label = 'Бесплатно! 🎁';
  } else if (data.discount_pct > 0 && data.discount_fixed > 0) {
    label = `Скидка ${data.discount_pct}% + ${data.discount_fixed} ₽ — итого ${finalPrice} ₽`;
  } else if (data.discount_pct > 0) {
    label = `Скидка ${data.discount_pct}% — итого ${finalPrice} ₽`;
  } else {
    label = `Скидка ${data.discount_fixed} ₽ — итого ${finalPrice} ₽`;
  }

  return NextResponse.json({
    valid: true,
    discount_pct: data.discount_pct,
    discount_fixed: data.discount_fixed,
    final_price: finalPrice,
    label,
  });
}
