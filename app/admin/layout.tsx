import Link from 'next/link';
import type { ReactNode } from 'react';
import { VercelAnalyticsButton } from './VercelAnalyticsButton';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-6">
      <div className="max-w-[95vw] mx-auto space-y-6">
        <header className="retro-panel bg-[#142a45] text-[#ffeccd] px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/70">Админ</p>
              <h1 className="text-3xl sm:text-4xl font-black leading-tight">Аналитический центр</h1>
            </div>
            <nav className="flex flex-wrap gap-2">
              <Link
                href="/admin"
                className="px-5 py-3 rounded-2xl border-[3px] border-[#ffeccd] text-[#ffeccd] font-black tracking-[0.2em] hover:bg-[#ffeccd]/10 transition"
              >
                Дашборд
              </Link>
              <Link
                href="/admin/rooms"
                className="px-5 py-3 rounded-2xl border-[3px] border-[#ffeccd] text-[#ffeccd] font-black tracking-[0.2em] hover:bg-[#ffeccd]/10 transition"
              >
                Комнаты
              </Link>
              <Link
                href="/admin/uno"
                className="px-5 py-3 rounded-2xl border-[3px] border-[#f1362f] text-[#f1362f] font-black tracking-[0.2em] hover:bg-[#f1362f]/10 transition"
              >
                UNO
              </Link>
              <Link
                href="/admin/draw"
                className="px-5 py-3 rounded-2xl border-[3px] border-[#a855f7] text-[#a855f7] font-black tracking-[0.2em] hover:bg-[#a855f7]/10 transition"
              >
                Рисункач
              </Link>
              <Link
                href="/admin/jokester"
                className="px-5 py-3 rounded-2xl border-[3px] border-[#f59e0b] text-[#f59e0b] font-black tracking-[0.2em] hover:bg-[#f59e0b]/10 transition"
              >
                Пошутикач
              </Link>
              <Link
                href="/admin/creativach"
                className="px-5 py-3 rounded-2xl border-[3px] border-[#FF6B35] text-[#FF6B35] font-black tracking-[0.2em] hover:bg-[#FF6B35]/10 transition"
              >
                Креативач
              </Link>
              <Link
                href="/admin/vecherinkach"
                className="px-5 py-3 rounded-2xl border-[3px] border-[#22c55e] text-[#22c55e] font-black tracking-[0.2em] hover:bg-[#22c55e]/10 transition"
              >
                Вечеринкач
              </Link>
              <VercelAnalyticsButton />
            </nav>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
