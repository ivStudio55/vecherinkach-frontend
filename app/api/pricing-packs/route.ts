import { query } from '@/lib/db.server';
import { json, withCacheControl } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface PricingPack {
  id: string;
  label: string;
  description: string;
  price: number;
}

export interface GamePricingInfo {
  price: number;
  publicPacks: PricingPack[];
  privatePacks: PricingPack[];
}

export interface PricingPacksResponse {
  vecherinkach: GamePricingInfo;
  jokester: GamePricingInfo;
  draw: GamePricingInfo;
}

type PackPriceRow = {
  id: string;
  label: string;
  description: string | null;
  is_public: boolean;
  price: number | null;
};

type GamePriceRow = {
  game: string;
  price: number;
};

export async function GET(): Promise<Response> {
  const FALLBACK_PRICES: Record<string, number> = { vecherinkach: 300, jokester: 200, draw: 200 };

  const [vecData, jokData, drawData, gamePrices] = await Promise.all([
    query<PackPriceRow>(
      `select id, label, description, is_public, price
       from question_packs
       where is_active = true
       order by created_at asc`,
    ),
    query<PackPriceRow>(
      `select id, label, description, is_public, price
       from jokester_question_packs
       where is_active = true
       order by created_at asc`,
    ),
    query<PackPriceRow>(
      `select id, label, description, is_public, price
       from draw_packs
       where is_active = true
       order by created_at asc`,
    ),
    query<GamePriceRow>(
      `select game, price
       from game_prices`,
    ),
  ]);

  const prices: Record<string, number> = { ...FALLBACK_PRICES };
  for (const row of gamePrices) prices[row.game] = row.price;

  const mapPack = (pack: PackPriceRow, gameDefault: number): PricingPack => ({
    id: pack.id,
    label: pack.label,
    description: pack.description ?? '',
    price: pack.price ?? gameDefault,
  });

  const result: PricingPacksResponse = {
    vecherinkach: {
      price: prices.vecherinkach,
      publicPacks: vecData.filter((pack) => pack.is_public).map((pack) => mapPack(pack, prices.vecherinkach)),
      privatePacks: vecData.filter((pack) => !pack.is_public).map((pack) => mapPack(pack, prices.vecherinkach)),
    },
    jokester: {
      price: prices.jokester,
      publicPacks: jokData.filter((pack) => pack.is_public).map((pack) => mapPack(pack, prices.jokester)),
      privatePacks: jokData.filter((pack) => !pack.is_public).map((pack) => mapPack(pack, prices.jokester)),
    },
    draw: {
      price: prices.draw,
      publicPacks: drawData.filter((pack) => pack.is_public).map((pack) => mapPack(pack, prices.draw)),
      privatePacks: drawData.filter((pack) => !pack.is_public).map((pack) => mapPack(pack, prices.draw)),
    },
  };

  return json(result, withCacheControl('public, max-age=60, s-maxage=120'));
}
