"use client";

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  cardPlayable,
  drawUnoCard,
  fetchUnoPlayers,
  fetchUnoRoomByCode,
  playUnoCard,
  startUnoGame,
  subscribeUnoPlayers,
  subscribeUnoRoom,
  unoStorage,
} from '@/lib/uno/api';
import type { UnoCard, UnoPlayer, UnoRoom } from '@/lib/uno/types';

function cardLabel(card: UnoCard) {
  if (card.kind === 'verb' && card.verb) {
    return `${card.verb.infinitive} · ${card.verb.pastSimple} · ${card.verb.pastParticiple}`;
  }
  if (card.kind === 'number') return `${card.value ?? ''}`;
  if (card.kind === 'wild') return 'Wild';
  if (card.kind === 'wild4') return 'Wild +4';
  if (card.kind === 'draw2') return '+2';
  if (card.kind === 'skip') return 'Skip';
  if (card.kind === 'reverse') return 'Reverse';
  return card.kind;
}

function cardBg(card: UnoCard) {
  switch (card.color) {
    case 'red':
      return 'bg-[#f1362f]';
    case 'yellow':
      return 'bg-[#ffd92c] text-black';
    case 'green':
      return 'bg-[#2fc36f]';
    case 'blue':
      return 'bg-[#1f6ac6]';
    default:
      return 'bg-white/10';
  }
}

export default function UnoRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params?.code || '').toString().toUpperCase();
  const [room, setRoom] = useState<UnoRoom | null>(null);
  const [players, setPlayers] = useState<UnoPlayer[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const session = useMemo(() => unoStorage.get(), []);
  const me = useMemo(() => players.find(p => p.id === session.playerId), [players, session.playerId]);

  const myHand: UnoCard[] = useMemo(() => {
    if (!room || !me) return [];
    const raw = (room.hands?.[me.id] as unknown) as UnoCard[] | undefined;
    return raw || [];
  }, [room, me]);

  const topCard: UnoCard | null = useMemo(() => {
    if (!room || !room.discard_pile || room.discard_pile.length === 0) return null;
    return room.discard_pile[room.discard_pile.length - 1];
  }, [room]);

  const refresh = async () => {
    try {
      const fetchedRoom = await fetchUnoRoomByCode(code);
      setRoom(fetchedRoom);
      const fetchedPlayers = await fetchUnoPlayers(fetchedRoom.id);
      setPlayers(fetchedPlayers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить комнату');
    }
  };

  useEffect(() => {
    refresh();
  }, [code]);

  useEffect(() => {
    if (!room) return;
    const offRoom = subscribeUnoRoom(room.id, updated => setRoom(updated));
    const offPlayers = subscribeUnoPlayers(room.id, () => refresh());
    return () => {
      offRoom();
      offPlayers();
    };
  }, [room?.id]);

  const handleStart = async () => {
    if (!room) return;
    setPending(true);
    try {
      await startUnoGame(room.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось стартовать игру');
    } finally {
      setPending(false);
    }
  };

  const handleDraw = async () => {
    if (!room || !me) return;
    setPending(true);
    try {
      await drawUnoCard(room.code, me.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось взять карту');
    } finally {
      setPending(false);
    }
  };

  const handlePlay = async (card: UnoCard) => {
    if (!room || !me) return;
    const needsColor = card.kind === 'wild' || card.kind === 'wild4';
    let chosenColor: 'red' | 'yellow' | 'green' | 'blue' | undefined;
    if (needsColor) {
      chosenColor = prompt('Выберите цвет: red / yellow / green / blue') as any;
    }
    setPending(true);
    try {
      await playUnoCard({ roomCode: room.code, playerId: me.id, cardId: card.id, chosenColor });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сходить картой');
    } finally {
      setPending(false);
    }
  };

  const myTurn = room && me && room.current_player_id === me.id;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d1117] via-[#0b1224] to-[#0d1117] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/60">комната</p>
            <h1 className="text-2xl font-black">UNO · {code}</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/80">
            <Link href="/uno" className="rounded-xl border border-white/20 px-3 py-2 hover:bg-white/10">Назад</Link>
            <Link href="/host" className="rounded-xl border border-[#f1362f] bg-[#f1362f] text-black px-3 py-2 font-bold hover:brightness-95">Создать квиз-комнату</Link>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-[#ffb4b4]/40 bg-[#ffb4b4]/10 px-4 py-3 text-sm text-[#ffb4b4]">{error}</div> : null}

        <div className="grid gap-4 md:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/15 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3 text-sm text-white/80">
                <span>Статус: {room?.status || '...'} · Режим: {room?.mode || '-'}</span>
                <span>Ход: {myTurn ? 'твой' : room?.current_player_id ? 'ждём' : '—'}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">верхняя карта</p>
                  {topCard ? (
                    <div className={`mt-2 rounded-2xl px-3 py-3 text-sm font-bold ${cardBg(topCard)}`}>
                      {cardLabel(topCard)}
                    </div>
                  ) : (
                    <p className="text-white/70 text-sm mt-1">Колода не разложена</p>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">колоды</p>
                  <p className="text-sm text-white/80 mt-1">Взять: {room?.draw_pile?.length ?? 0}</p>
                  <p className="text-sm text-white/80">Сброс: {room?.discard_pile?.length ?? 0}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={pending || !me || room?.status !== 'lobby'}
                  className="rounded-xl bg-[#ffd92c] text-black px-4 py-2 border border-white/20 disabled:opacity-60"
                >
                  {pending ? '...' : 'Старт игры'}
                </button>
                <button
                  type="button"
                  onClick={handleDraw}
                  disabled={pending || !myTurn}
                  className="rounded-xl bg-white/10 px-4 py-2 border border-white/20 disabled:opacity-60"
                >
                  Взять карту
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/15 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Твоя рука ({myHand.length})</p>
                <span className="text-xs text-white/60">клик по карте — ход</span>
              </div>
              {myHand.length === 0 ? (
                <p className="text-white/70 text-sm">Пока нет карт.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {myHand.map(card => {
                    const playable = cardPlayable(card, topCard);
                    return (
                      <button
                        key={card.id}
                        onClick={() => handlePlay(card)}
                        disabled={!playable || !myTurn || pending}
                        className={`text-left rounded-2xl px-3 py-3 border border-white/20 ${cardBg(card)} ${playable && myTurn ? 'hover:scale-[1.02]' : 'opacity-60 cursor-not-allowed'}`}
                      >
                        <div className="text-xs uppercase tracking-[0.12em]">{card.color}</div>
                        <div className="text-sm font-bold leading-snug mt-1">{cardLabel(card)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/15 bg-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Игроки</p>
              <span className="text-xs text-white/60">{players.length} чел.</span>
            </div>
            <div className="space-y-2">
              {players.map(p => {
                const handCount = room?.hands?.[p.id]?.length ?? 0;
                const isCurrent = room?.current_player_id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`rounded-2xl border border-white/10 px-3 py-2 text-sm flex items-center justify-between ${isCurrent ? 'bg-white/10' : 'bg-white/5'}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-xs text-white/60">Карт: {handCount}</span>
                    </div>
                    {p.is_host ? <span className="text-[11px] uppercase tracking-[0.2em] text-[#ffd92c]">host</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
