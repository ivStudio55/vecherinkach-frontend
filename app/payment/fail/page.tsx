import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Оплата не завершена — Вечеринкач',
};

export default function PaymentFailPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 py-12">
      <div
        className="w-full max-w-md rounded-2xl shadow-xl p-8 text-center"
        style={{ background: 'var(--panel)', color: 'var(--foreground)' }}
      >
        <div className="text-5xl mb-4">😕</div>
        <h1
          className="text-2xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-comic-cat)' }}
        >
          Оплата не завершена
        </h1>
        <p className="opacity-70 mb-6 text-sm">
          Платёж был отменён или не прошёл. Деньги не списаны.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/pricing"
            className="inline-block w-full px-6 py-3 rounded-full font-bold text-white transition-transform hover:scale-105"
            style={{ background: 'var(--accent-blue)', fontFamily: 'var(--font-comic-cat)' }}
          >
            Попробовать снова
          </Link>
          <Link
            href="/"
            className="inline-block w-full px-6 py-3 rounded-full font-semibold transition-transform hover:scale-105"
            style={{ background: 'var(--panel-muted)', color: 'var(--foreground)' }}
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
