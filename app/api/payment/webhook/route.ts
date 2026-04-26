import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

const SHOP_ID = process.env.YUKASSA_SHOP_ID;
const SECRET_KEY = process.env.YUKASSA_SECRET_KEY;

function generateRoomCode(): string {
  // Unambiguous characters only (no 0/O, 1/I/L)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  if (!SHOP_ID || !SECRET_KEY) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Only handle succeeded payments
  if (body.type !== 'payment.succeeded') {
    return NextResponse.json({ ok: true });
  }

  const paymentObj = body.object as Record<string, unknown> | undefined;
  const paymentId = paymentObj?.id as string | undefined;
  if (!paymentId) {
    return NextResponse.json({ error: 'No payment ID' }, { status: 400 });
  }

  // Verify payment by re-fetching from YuKassa (don't trust webhook body alone)
  const credentials = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
  let verifyRes: Response;
  try {
    verifyRes = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
  } catch (err) {
    console.error('[payment/webhook] YuKassa verify fetch error:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }

  if (!verifyRes.ok) {
    console.error('[payment/webhook] YuKassa verify failed:', paymentId);
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const payment = await verifyRes.json();

  if (payment.status !== 'succeeded') {
    return NextResponse.json({ ok: true });
  }

  const orderId = (payment.metadata as Record<string, string> | undefined)?.orderId;
  if (!orderId) {
    console.error('[payment/webhook] No orderId in metadata for payment:', paymentId);
    return NextResponse.json({ error: 'No orderId' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  // Check if already processed (idempotency)
  const { data: order } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (order.status === 'paid') {
    // Already processed — idempotent response
    return NextResponse.json({ ok: true });
  }

  const roomCode = generateRoomCode();
  await supabase
    .from('orders')
    .update({ status: 'paid', room_code: roomCode })
    .eq('id', orderId);

  return NextResponse.json({ ok: true });
}
