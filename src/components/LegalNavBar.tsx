'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/pricing', label: '🛒 Магазин', title: 'Купить пакет вопросов' },
  { href: '/offer', label: '📋 Оферта', title: 'Публичная оферта' },
  { href: '/requisites', label: '🏢 Реквизиты', title: 'Реквизиты исполнителя' },
];

export function LegalNavBar() {
  const pathname = usePathname();

  return (
    <div
      className="sticky top-0 z-50 backdrop-blur-sm border-b"
      style={{ background: 'var(--panel)', borderColor: 'rgba(0,0,0,0.08)' }}
    >
      <div className="w-full max-w-3xl mx-auto px-4 py-2 flex items-center gap-1 flex-wrap">
        <Link
          href="/"
          className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ color: 'var(--foreground)', opacity: 0.55 }}
        >
          ← Главная
        </Link>

        <div className="flex-1" />

        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              title={tab.title}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={
                isActive
                  ? { background: 'var(--accent-blue)', color: '#fff' }
                  : { color: 'var(--foreground)', opacity: 0.6 }
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
