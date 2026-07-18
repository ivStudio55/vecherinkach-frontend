'use client';

import { useState } from 'react';

type GuideVariant = 'dark' | 'light' | 'comic';

interface GameConnectionGuideProps {
  gameName: string;
  hostScreenText?: string;
  playerText?: string;
  spectatorText?: string;
  variant?: GuideVariant;
}

const variantClass: Record<GuideVariant, string> = {
  dark: 'border-white/10 bg-black/35 text-white shadow-2xl backdrop-blur',
  light: 'border-black bg-white text-black shadow-[6px_6px_0_#000]',
  comic: 'border-black bg-[#fff7c7] text-black shadow-[6px_6px_0_#000]',
};

const stepClass: Record<GuideVariant, string> = {
  dark: 'border-white/10 bg-white/5',
  light: 'border-black bg-white',
  comic: 'border-black bg-white',
};

export function GameConnectionGuide({
  gameName,
  hostScreenText = 'Откройте экран ведущего на отдельном устройстве: ноутбуке, телевизоре, проекторе или другом большом экране. Там будет поле, ход игры, таймеры и подсказки ведущего.',
  playerText = 'Игроки подключаются каждый со своего телефона: сканируют QR-код или вводят код комнаты, затем отвечают и выполняют действия на личном экране.',
  spectatorText,
  variant = 'dark',
}: GameConnectionGuideProps) {
  const [isOpen, setIsOpen] = useState(false);
  const mutedText = variant === 'dark' ? 'text-white/70' : 'text-black/70';
  const badge = variant === 'dark'
    ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-200'
    : 'border-black bg-yellow-300 text-black';

  return (
    <section className={`rounded-3xl border-[3px] ${variantClass[variant]}`}>
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 p-4 text-left md:p-5"
      >
        <div className="min-w-0">
          <div className={`mb-2 inline-flex rounded-full border-2 px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badge}`}>
            Как подключаться
          </div>
          <h2 className="text-lg font-black leading-tight md:text-xl">
            {gameName}: ведущий отдельно, игроки с телефонов
          </h2>
          <p className={`mt-1 line-clamp-1 text-xs md:text-sm ${mutedText}`}>
            Общий экран для ведущего, личные телефоны для игроков.
          </p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 font-black transition-transform ${stepClass[variant]} ${isOpen ? 'rotate-180' : ''}`}>
          ↓
        </span>
      </button>

      <div className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-5 md:px-5 md:pb-6">
            <p className={`text-sm leading-relaxed md:text-base ${mutedText}`}>
              Не запускайте всё с одного устройства: общий экран нужен для всей компании, а телефон игрока - для личных ответов и действий.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className={`rounded-2xl border-2 p-4 ${stepClass[variant]}`}>
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-red-500 text-lg font-black text-white">1</div>
                <h3 className="font-black">Создайте комнату</h3>
                <p className={`mt-2 text-sm leading-relaxed ${mutedText}`}>
                  Ведущий создает игру и получает код комнаты или QR-код для подключения.
                </p>
              </div>

              <div className={`rounded-2xl border-2 p-4 ${stepClass[variant]}`}>
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500 text-lg font-black text-white">2</div>
                <h3 className="font-black">Экран ведущего</h3>
                <p className={`mt-2 text-sm leading-relaxed ${mutedText}`}>{hostScreenText}</p>
              </div>

              <div className={`rounded-2xl border-2 p-4 ${stepClass[variant]}`}>
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-400 text-lg font-black text-black">3</div>
                <h3 className="font-black">Телефоны игроков</h3>
                <p className={`mt-2 text-sm leading-relaxed ${mutedText}`}>{playerText}</p>
              </div>
            </div>

            {spectatorText && (
              <div className={`mt-4 rounded-2xl border-2 p-4 text-sm font-bold leading-relaxed ${stepClass[variant]}`}>
                {spectatorText}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
