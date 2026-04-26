import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

const SHOP_ID = process.env.YUKASSA_SHOP_ID;
const SECRET_KEY = process.env.YUKASSA_SECRET_KEY;
const BASE_URL = 'https://vecherinkach.ru';

const GAME_NAMES: Record<string, string> = {
  vecherinkach: 'Вечеринкач — игровая сессия',
  jokester: 'Пошутикач — игровая сессия',
  creativach: 'Креативач — игровая сессия',
};

const FALLBACK_PRICES: Record<string, number> = {
  vecherinkach: 300,
  jokester: 200,
  creativach: 200,
};

// In-memory price cache (5-minute TTL)
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
  return priceCache?.prices[game] ?? FALLBACK_PRICES[game] ?? 0;
}

// --- Room creation helpers (mirrored from payment/success) ---

function generateGameCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function createVecherinkachRoom(packId: string) {
  const supabase = getSupabaseAdminClient();
  const code = generateGameCode();
  const { data, error } = await supabase.rpc('create_room', { p_code: code, p_pack_id: packId });
  if (error) throw new Error(`create_room failed: ${error.message}`);
  const room = Array.isArray(data) ? data[0] : data;
  if (!room?.id) throw new Error('create_room returned no id');
  return { id: room.id as string, code };
}

async function createJokesterRoom(packId: string) {
  const supabase = getSupabaseAdminClient();
  for (let i = 0; i < 10; i++) {
    const code = generateGameCode();
    const { data: room, error } = await supabase
      .from('jokester_rooms')
      .insert({ code, status: 'lobby', state_version: 1, pack_id: packId })
      .select('id, code')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') continue;
      throw new Error(`jokester_rooms insert: ${error.message}`);
    }
    if (!room) continue;
    const { data: player, error: pe } = await supabase
      .from('jokester_players')
      .insert({ room_id: room.id, name: 'Ведущий', role: 'player', is_host: true, seat: 0, avatar: '1.png' })
      .select('id')
      .single();
    if (pe || !player) throw new Error(`jokester_players insert: ${pe?.message}`);
    await supabase.from('jokester_rooms').update({ host_id: player.id }).eq('id', room.id);
    return { id: room.id as string, code: room.code as string };
  }
  throw new Error('Could not generate unique jokester code');
}

// ---

export async function POST(req: NextRequest) {
  let body: { game?: string; email?: string; pack_id?: string; promo_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { game, email, pack_id, promo_code } = body;

  if (!game || !GAME_NAMES[game]) {
    return NextResponse.json({ error: 'Unknown game' }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  if (!pack_id) {
    return NextResponse.json({ error: 'Pack not selected' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  // Validate pack exists, is active, and is private (paid)
  const packTable = game === 'jokester' ? 'jokester_question_packs' : 'question_packs';
  const { data: packRow, error: packErr } = await supabase
    .from(packTable)
    .select('id, label, is_public, is_active, price')
    .eq('id', pack_id)
    .single();

  if (packErr || !packRow) {
    return NextResponse.json({ error: 'Пакет не найден' }, { status: 400 });
  }
  if (!packRow.is_active) {
    return NextResponse.json({ error: 'Пакет недоступен' }, { status: 400 });
  }
  if (packRow.is_public) {
    return NextResponse.json({ error: 'Этот пакет бесплатный' }, { status: 400 });
  }

  // Pack-specific price takes priority over game-level price
  const originalPrice = packRow.price != null ? packRow.price : await getGamePrice(game);
  const packName = `${GAME_NAMES[game]}: ${packRow.label}`;

  // --- Promo code ---
  let finalPrice = originalPrice;
  let appliedPromoCode: string | null = null;

  if (promo_code) {
    const normalizedCode = promo_code.toUpperCase().trim();

    // Fetch promo code directly (avoid unreliable PostgREST RPC for write ops)
    const { data: promoRow, error: promoFetchErr } = await supabase
      .from('promo_codes')
      .select('id, discount_pct, discount_fixed, used_count, max_uses, expires_at, game, pack_id')
      .eq('code', normalizedCode)
      .eq('is_active', true)
      .single();

    if (promoFetchErr || !promoRow) {
      return NextResponse.json({ error: 'Промокод недействителен' }, { status: 400 });
    }
    if (promoRow.expires_at && new Date(promoRow.expires_at) <= new Date()) {
      return NextResponse.json({ error: 'Срок действия промокода истёк' }, { status: 400 });
    }
    if (promoRow.max_uses !== null && promoRow.used_count >= promoRow.max_uses) {
      return NextResponse.json({ error: 'Промокод уже использован максимальное количество раз' }, { status: 400 });
    }
    if (promoRow.game && promoRow.game !== game) {
      return NextResponse.json({ error: 'Промокод недействителен для этой игры' }, { status: 400 });
    }
    if (promoRow.pack_id && promoRow.pack_id !== pack_id) {
      return NextResponse.json({ error: 'Промокод недействителен для этого пакета' }, { status: 400 });
    }

    // Increment used_count with optimistic concurrency check
    const { error: updateErr } = await supabase
      .from('promo_codes')
      .update({ used_count: promoRow.used_count + 1 })
      .eq('id', promoRow.id)
      .eq('used_count', promoRow.used_count);

    if (updateErr) {
      console.error('[payment/create] promo increment error:', updateErr);
      return NextResponse.json({ error: 'Промокод уже использован' }, { status: 400 });
    }

    const afterPct = Math.round(originalPrice * (1 - promoRow.discount_pct / 100));
    finalPrice = Math.max(0, afterPct - (promoRow.discount_fixed ?? 0));
    appliedPromoCode = normalizedCode;
  }

  // --- Free order (Variant B or 100% discount) ---
  if (finalPrice <= 0) {
    try {
      const roomInfo = game === 'jokester'
        ? await createJokesterRoom(pack_id)
        : await createVecherinkachRoom(pack_id);

      const { data: order, error: dbErr } = await supabase
        .from('orders')
        .insert({
          game,
          pack_id,
          pack_name: packName,
          amount: 0,
          original_amount: originalPrice,
          customer_email: email,
          status: 'paid',
          promo_code: appliedPromoCode,
          room_code: roomInfo.code,
          room_id: roomInfo.id,
        })
        .select('id')
        .single();

      if (dbErr || !order) {
        console.error('[payment/create] free order DB error:', dbErr);
        return NextResponse.json({ error: 'Ошибка создания заказа' }, { status: 500 });
      }

      return NextResponse.json({ free: true, orderId: order.id });
    } catch (err) {
      console.error('[payment/create] free room creation error:', err);
      return NextResponse.json({ error: 'Ошибка создания комнаты' }, { status: 500 });
    }
  }

  // --- Paid order (ЮKassa) ---
  if (!SHOP_ID || !SECRET_KEY) {
    return NextResponse.json({ error: 'Payment not configured' }, { status: 503 });
  }

  const priceStr = finalPrice.toFixed(2);

  const { data: order, error: dbError } = await supabase
    .from('orders')
    .insert({
      game,
      pack_id,
      pack_name: packName,
      amount: finalPrice,
      original_amount: finalPrice < originalPrice ? originalPrice : null,
      customer_email: email,
      status: 'pending',
      promo_code: appliedPromoCode,
    })
    .select('id')
    .single();

  if (dbError || !order) {
    console.error('[payment/create] DB error:', dbError);
    return NextResponse.json({ error: 'Ошибка создания заказа' }, { status: 500 });
  }

  const orderId: string = order.id;

  // Create payment at YuKassa
  const credentials = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
  let yukassaRes: Response;
  try {
    yukassaRes = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
        'Idempotence-Key': orderId,
      },
      body: JSON.stringify({
        amount: { value: priceStr, currency: 'RUB' },
        confirmation: {
          type: 'redirect',
          return_url: `${BASE_URL}/payment/success?orderId=${orderId}`,
        },
        capture: true,
        description: packName,
        receipt: {
          customer: { email },
          items: [
            {
              description: packName,
              quantity: '1.00',
              amount: { value: priceStr, currency: 'RUB' },
              vat_code: 1,
              payment_subject: 'service',
              payment_mode: 'full_payment',
            },
          ],
        },
        metadata: { orderId },
      }),
    });
  } catch (err) {
    console.error('[payment/create] YuKassa fetch error:', err);
    return NextResponse.json({ error: 'Ошибка платёжного сервиса' }, { status: 502 });
  }

  if (!yukassaRes.ok) {
    const errData = await yukassaRes.json().catch(() => ({}));
    console.error('[payment/create] YuKassa error:', errData);
    return NextResponse.json({ error: 'Ошибка платёжного сервиса' }, { status: 502 });
  }

  const payment = await yukassaRes.json();

  // Save YuKassa payment ID
  await supabase
    .from('orders')
    .update({ yukassa_payment_id: payment.id })
    .eq('id', orderId);

  return NextResponse.json({
    confirmationUrl: payment.confirmation.confirmation_url,
    orderId,
  });
}
