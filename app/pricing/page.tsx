import type { Metadata } from 'next';
import PackBuyButton from './PayButton';
import { LegalNavBar } from '@/components/LegalNavBar';

export const metadata: Metadata = {
  title: 'Пакеты — Вечеринкач',
  description: 'Бесплатные и платные пакеты вопросов для Вечеринкача и Пошутикача',
};

interface PricingPack {
  id: string;
  label: string;
  description: string;
  price: number;
}

interface GameInfo {
  price: number;
  publicPacks: PricingPack[];
  privatePacks: PricingPack[];
}

interface PricingData {
  vecherinkach: GameInfo;
  jokester: GameInfo;
  draw: GameInfo;
}

async function getPricingData(): Promise<PricingData | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://vecherinkach.ru'}/api/pricing-packs`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const GAMES = [
  {
    key: 'vecherinkach' as const,
    label: 'Вечеринкач',
    emoji: '🎉',
    freePlayUrl: (packId: string) => `/?pack=${packId}`,
  },
  {
    key: 'jokester' as const,
    label: 'Пошутикач',
    emoji: '😄',
    freePlayUrl: (packId: string) => `/jokester?pack=${packId}`,
  },
  {
    key: 'draw' as const,
    label: 'Рисункач',
    emoji: '🎨',
    freePlayUrl: (packId: string) => `/draw?pack=${packId}`,
  },
];

interface PackCardProps {
  pack: PricingPack;
  game: string;
  freePlayUrl: (id: string) => string;
  isFree: boolean;
}

function PackCard({ pack, game, freePlayUrl, isFree }: PackCardProps) {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden shadow-md transition-shadow hover:shadow-xl"
      style={{ background: 'var(--panel)' }}
    >
      {/* Price badge strip */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{
          background: isFree ? 'rgba(22,163,74,0.12)' : 'rgba(31,106,198,0.10)',
        }}
      >
        {isFree ? (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.2)', color: '#16a34a' }}>
            Бесплатно
          </span>
        ) : (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(31,106,198,0.2)', color: 'var(--accent-blue)' }}>
            {pack.price} ₽ / сессия
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex-1">
          <h3 className="font-bold text-base leading-snug" style={{ fontFamily: 'var(--font-comic-cat)' }}>
            {pack.label}
          </h3>
          {pack.description && (
            <p className="text-xs opacity-60 mt-1 leading-snug line-clamp-3">{pack.description}</p>
          )}
        </div>

        <div className="mt-auto">
          {isFree ? (
            <a
              href={freePlayUrl(pack.id)}
              className="block w-full text-center px-4 py-2.5 rounded-full font-bold text-white text-sm transition-transform hover:scale-105"
              style={{ background: '#16a34a', fontFamily: 'var(--font-comic-cat)' }}
            >
              Играть →
            </a>
          ) : (
            <PackBuyButton game={game} packId={pack.id} price={pack.price} />
          )}
        </div>
      </div>
    </div>
  );
}

export default async function PricingPage() {
  const data = await getPricingData();

  return (
    <div className="min-h-screen" style={{ color: 'var(--foreground)' }}>
      <LegalNavBar />
      <div className="p-4 py-10">
        <div className="w-full max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h1
              className="text-3xl md:text-4xl font-bold mb-3"
              style={{ fontFamily: 'var(--font-comic-cat)' }}
            >
              Пакеты вопросов
            </h1>
            <p className="opacity-70 text-sm md:text-base max-w-xl mx-auto">
              Бесплатные пакеты доступны всем — просто нажми «Играть».
              Платные пакеты оплачиваются разово за сессию и автоматически создают игровую комнату.
            </p>
          </div>

          <div className="flex flex-col gap-12">
            {GAMES.map((game) => {
              const gameData = data?.[game.key];
              const publicPacks = gameData?.publicPacks ?? [];
              const privatePacks = gameData?.privatePacks ?? [];
              const allPacks = [...publicPacks, ...privatePacks];

              if (allPacks.length === 0) return null;

              return (
                <section key={game.key}>
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-3xl">{game.emoji}</span>
                    <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-comic-cat)' }}>
                      {game.label}
                    </h2>
                    <div className="flex-1 h-px opacity-10" style={{ background: 'var(--foreground)' }} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {publicPacks.map((pack) => (
                      <PackCard
                        key={pack.id}
                        pack={pack}
                        game={game.key}
                        freePlayUrl={game.freePlayUrl}
                        isFree
                      />
                    ))}
                    {privatePacks.map((pack) => (
                      <PackCard
                        key={pack.id}
                        pack={pack}
                        game={game.key}
                        freePlayUrl={game.freePlayUrl}
                        isFree={false}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <p className="text-center text-xs opacity-40 mt-10" style={{ color: 'var(--foreground)' }}>
            Все цены в рублях РФ · НДС не облагается (самозанятый, НПД) · Оплата через ЮКасса
          </p>
        </div>
      </div>
    </div>
  );
}
