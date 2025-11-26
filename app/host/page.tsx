'use client';

import { useState, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import backTexture from '../img/back2.png';

export default function HostPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const generateRoomCode = (): string => Math.floor(1000 + Math.random() * 9000).toString();

  const createRoom = async () => {
    setError('');
    setIsCreating(true);

    try {
      let attempts = 0;
      let roomCode = '';

      while (attempts < 10) {
        roomCode = generateRoomCode();

        const { data, error: insertError } = await supabase
          .from('rooms')
          .insert({
            code: roomCode,
            current_question_index: 0,
            is_active: true,
            status: 'waiting',
            question_started_at: null,
          })
          .select()
          .single();

        if (!insertError && data) {
          localStorage.setItem('hostRoomId', data.id);
          localStorage.setItem('hostRoomCode', roomCode);
          router.push(`/host/${data.id}`);
          return;
        }

        attempts += 1;
      }

      setError('Не удалось создать комнату. Попробуйте ещё раз.');
      setIsCreating(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка: ${message}`);
      setIsCreating(false);
    }
  };

  const backgroundStyle: CSSProperties = {
    backgroundImage: `url(${backTexture.src})`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
  };

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-10" style={backgroundStyle}>
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="retro-panel bg-[#142a45] text-[#ffeccd] px-6 py-5">
          <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/70">Ведущая станция</p>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight">Создайте комнату и берите управление в свои руки</h1>
          <p className="text-sm text-[#ffeccd]/70 mt-2">
            После создания комнаты вы получите код из четырёх цифр. Им можно делиться на экране или голосом.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-5">
            <div className="space-y-2">
              <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Шаги подключения</p>
              <h2 className="text-2xl font-black">Как проходит запуск</h2>
            </div>
            <ol className="space-y-3 text-sm font-semibold text-[#142a45]/80">
              <li className="flex gap-3">
                <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">1</span>
                Вы получаете код комнаты и выводите его на экран.
              </li>
              <li className="flex gap-3">
                <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">2</span>
                Игроки переходят на `/join`, вводят код и свои ники.
              </li>
              <li className="flex gap-3">
                <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">3</span>
                Панель ведущего показывает таймеры, вопросы и очередь ответов.
              </li>
            </ol>
            <div className="rounded-2xl border-[3px] border-dashed border-[#142a45]/50 bg-[#fff6da] px-4 py-3 text-sm">
              <p className="font-semibold">Подсказка</p>
              <p className="text-[#142a45]/70">Комната активна, пока вы не завершите раунд на панели. Повторное использование кода невозможно.</p>
            </div>
          </div>

          <div className="rounded-3xl border-[4px] border-[#142a45] bg-[#ffe184] p-6 space-y-5">
            <div className="space-y-2">
              <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Создание комнаты</p>
              <h2 className="text-2xl font-black">Управление запуском</h2>
              <p className="text-sm text-[#142a45]/80">Одним нажатием вы запускаете новый сеанс игры и блокируете код за собой.</p>
            </div>

            {error && (
              <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                {error}
              </div>
            )}

            <button
              onClick={createRoom}
              disabled={isCreating}
              className="w-full py-4 rounded-2xl font-black text-xl tracking-[0.2em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Создаём комнату…' : '🎮 Создать комнату'}
            </button>

            <button
              type="button"
              onClick={() => router.push('/')}
              className="w-full py-3 rounded-2xl border-[3px] border-[#142a45] font-semibold bg-white hover:bg-[#fef4dc] transition"
            >
              ← На главную
            </button>

            <div className="rounded-2xl border-[3px] border-[#142a45] bg-white/70 px-4 py-3 text-sm">
              <p className="retro-heading text-[10px] tracking-[0.4em] text-[#142a45]/60">Что подготовить</p>
              <ul className="list-disc list-inside space-y-1 text-[#142a45]/80">
                <li>Колонку или джингл для атмосферы</li>
                <li>Ссылку `/join` для участников</li>
                <li>Вопросы раунда (уже вшиты в систему)</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
