'use client';

import { useState } from 'react';

interface Props {
  game: string;
  packId: string;
  price: number;
}

interface PromoResult {
  valid: boolean;
  discount_pct?: number;
  discount_fixed?: number;
  final_price?: number;
  label?: string;
  error?: string;
}

export default function PackBuyButton({ game, packId, price }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState('');

  const finalPrice = promoResult?.valid ? (promoResult.final_price ?? price) : price;

  function reset() {
    setOpen(false);
    setEmail('');
    setError('');
    setPromoCode('');
    setPromoResult(null);
    setPromoError('');
  }

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    setPromoResult(null);
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode, game, pack_id: packId }),
      });
      const data: PromoResult = await res.json();
      if (!data.valid) {
        setPromoError(data.error ?? 'Промокод недействителен');
      } else {
        setPromoResult(data);
      }
    } catch {
      setPromoError('Ошибка проверки промокода');
    } finally {
      setPromoLoading(false);
    }
  }

  async function handlePay() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Введите корректный email');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game,
          pack_id: packId,
          email,
          promo_code: promoResult?.valid ? promoCode.toUpperCase().trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка оплаты');
      if (data.free) {
        window.location.href = `/payment/success?orderId=${data.orderId}`;
        return;
      }
      window.location.href = data.confirmationUrl;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка оплаты');
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full px-4 py-2.5 rounded-full font-bold text-white transition-transform hover:scale-105 text-sm"
        style={{ background: 'var(--accent-blue)', fontFamily: 'var(--font-comic-cat)' }}
      >
        {price === 0 ? 'Получить бесплатно 🎁' : `Купить — ${price} ₽`}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-60">Email для чека (54-ФЗ):</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="w-full px-3 py-2 rounded-lg border-2 text-sm bg-white"
        style={{ borderColor: 'var(--accent-blue)', color: '#111' }}
        onKeyDown={(e) => e.key === 'Enter' && handlePay()}
        autoFocus
        disabled={loading}
      />

      {/* Promo code */}
      <div className="flex gap-2">
        <input
          type="text"
          value={promoCode}
          onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoResult(null); setPromoError(''); }}
          placeholder="Промокод"
          className="flex-1 px-3 py-2 rounded-lg border-2 text-sm bg-white uppercase"
          style={{
            borderColor: promoResult?.valid ? '#16a34a' : 'rgba(0,0,0,0.15)',
            color: '#111',
          }}
          disabled={loading}
          onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
        />
        <button
          onClick={applyPromo}
          disabled={promoLoading || !promoCode.trim()}
          className="px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--accent-blue)' }}
        >
          {promoLoading ? '...' : 'Применить'}
        </button>
      </div>
      {promoError && <p className="text-xs text-red-500">{promoError}</p>}
      {promoResult?.valid && (
        <p className="text-xs font-bold" style={{ color: '#16a34a' }}>{promoResult.label}</p>
      )}

      {/* Final price display */}
      {promoResult?.valid && finalPrice !== price && (
        <p className="text-sm font-bold">
          <span className="line-through opacity-40 mr-1">{price} ₽</span>
          <span style={{ color: finalPrice === 0 ? '#16a34a' : 'var(--accent-blue)' }}>
            {finalPrice === 0 ? 'Бесплатно 🎁' : `${finalPrice} ₽`}
          </span>
        </p>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 mt-1">
        <button
          onClick={reset}
          className="flex-1 px-3 py-2 rounded-full text-sm font-semibold border-2 transition-colors"
          style={{ borderColor: 'rgba(0,0,0,0.15)', color: 'var(--foreground)' }}
        >
          Отмена
        </button>
        <button
          onClick={handlePay}
          disabled={loading || !email}
          className="flex-1 px-3 py-2 rounded-full text-sm font-bold text-white transition-transform hover:scale-105 disabled:opacity-40"
          style={{ background: finalPrice === 0 ? '#16a34a' : 'var(--accent-blue)' }}
        >
          {loading ? '...' : finalPrice === 0 ? 'Получить 🎁' : `Оплатить ${finalPrice} ₽`}
        </button>
      </div>
    </div>
  );
}
