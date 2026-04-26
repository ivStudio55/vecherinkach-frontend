import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface PricingPack {
  id: string;
  label: string;
  description: string;
  price: number; // resolved: pack.price ?? game default
}

export interface GamePricingInfo {
  price: number; // game-level default price
  publicPacks: PricingPack[];
  privatePacks: PricingPack[];
}

export interface PricingPacksResponse {
  vecherinkach: GamePricingInfo;
  jokester: GamePricingInfo;
}

export async function GET(): Promise<Response> {
  const supabase = getSupabaseAdminClient();

  const FALLBACK_PRICES: Record<string, number> = { vecherinkach: 300, jokester: 200 };

  const [vecPacks, jokesterPacks, gamePrices] = await Promise.all([
    supabase
      .from('question_packs')
      .select('id, label, description, is_public, price')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('jokester_question_packs')
      .select('id, label, description, is_public, price')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('game_prices')
      .select('game, price'),
  ]);

  const vecData = vecPacks.data ?? [];
  const jokData = jokesterPacks.data ?? [];
  const prices: Record<string, number> = { ...FALLBACK_PRICES };
  for (const row of (gamePrices.data ?? [])) prices[row.game] = row.price;

  const mapPack = (p: { id: string; label: string; description: string | null; price: number | null }, gameDefault: number): PricingPack => ({
    id: p.id,
    label: p.label,
    description: p.description ?? '',
    price: p.price ?? gameDefault,
  });

  const result: PricingPacksResponse = {
    vecherinkach: {
      price: prices.vecherinkach,
      publicPacks: vecData.filter(p => p.is_public).map(p => mapPack(p, prices.vecherinkach)),
      privatePacks: vecData.filter(p => !p.is_public).map(p => mapPack(p, prices.vecherinkach)),
    },
    jokester: {
      price: prices.jokester,
      publicPacks: jokData.filter(p => p.is_public).map(p => mapPack(p, prices.jokester)),
      privatePacks: jokData.filter(p => !p.is_public).map(p => mapPack(p, prices.jokester)),
    },
  };

  return Response.json(result, {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120' },
  });
}
