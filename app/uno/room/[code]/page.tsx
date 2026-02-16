"use client";

import { useEffect, useMemo, useState, useCallback } from 'react';
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
import type { UnoCard, UnoColor, UnoPlayer, UnoRoom } from '@/lib/uno/types';
import UnoCardView from '@/components/uno/UnoCardView';
import ColorPicker from '@/components/uno/ColorPicker';

/* ─────────── page ─────────── */

export default function UnoRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params?.code || '').toString().toUpperCase();

  const [room, setRoom] = useState<UnoRoom | null>(null);
  const [players, setPlayers] = useState<UnoPlayer[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [pickingColor, setPickingColor] = useState<UnoCard | null>(null);
  const [lastEvent, setLastEvent] = useState<string>('');

  const session = useMemo(() => {
    if (typeof window === 'undefined') return { playerId: null, playerName: null, roomCode: null, roomId: null };
    return unoStorage.get();
  }, []);

  const me = useMemo(() => players.find(p => p.id === session.playerId), [players, session.playerId]);

  /* ── derived state ── */
  const myHand: UnoCard[] = useMemo(() => {
    if (!room || !me) return [];
    return (room.hands?.[me.id] as UnoCard[]) || [];
  }, [room, me]);

  const topCard: UnoCard | null = useMemo(() => {
    if (!room?.discard_pile) return null;
    const pile = room.discard_pile;
    if (Array.isArray(pile) && pile.length > 0) return pile[pile.length - 1];
    return null;
  }, [room]);

  const myTurn = room?.status === 'playing' && !!me && room.current_player_id === me.id;
  const isFinished = room?.status === 'finished';
  const winnerName = useMemo(() => {
    if (!room?.winner_id) return null;
    return players.find(p => p.id === room.winner_id)?.name ?? 'Неизвестный';
  }, [room, players]);

  /* ── data loading ── */
  const refresh = useCallback(async () => {
    try {
      const r = await fetchUnoRoomByCode(code);
      setRoom(r);
      const p = await fetchUnoPlayers(r.id);
      setPlayers(p);
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка загрузки');
    }
  }, [code]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!room) return;
    const offRoom = subscribeUnoRoom(room.id, updated => setRoom(updated));
    const offPlayers = subscribeUnoPlayers(room.id, () => {
      fetchUnoPlayers(room.id).then(p => setPlayers(p)).catch(() => {});
    });
    return () => { offRoom(); offPlayers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  /* ── actions ── */
  const handleStart = async () => {
    if (!room) return;
    setPending(true);
    setError('');
    try {
      await startUnoGame(room.code);
      setLastEvent('🎮 Игра началась!');
    } catch (e: any) { setError(e?.message ?? 'Ошибка'); }
    finally { setPending(false); }
  };

  const handleDraw = async () => {
    if (!room || !me) return;
    setPending(true);
    setError('');
    try {
      const res = await drawUnoCard(room.code, me.id);
      setLastEvent('📥 Взята карта');
      if (res?.room) setRoom(res.room);
    } catch (e: any) { setError(e?.message ?? 'Ошибка'); }
    finally { setPending(false); }
  };

  const handlePlay = async (card: UnoCard, chosenColor?: UnoColor) => {
    if (!room || !me) return;
    setPending(true);
    setError('');
    try {
      const res = await playUnoCard({
        roomCode: room.code,
        playerId: me.id,
        cardId: card.id,
        chosenColor,
      });
      setLastEvent(`🃏 Сыграна карта`);
      if (res?.room) setRoom(res.room);
    } catch (e: any) { setError(e?.message ?? 'Нельзя сходить этой картой'); }
    finally { setPending(false); }
  };

  const onCardClick = (card: UnoCard) => {
    if (card.kind === 'wild' || card.kind === 'wild4') {
      setPickingColor(card);
      return;
    }
    handlePlay(card);
  };

  const currentPlayerName = useMemo(() => {
    if (!room?.current_player_id) return null;
    return players.find(p => p.id === room.current_player_id)?.name ?? '...';
  }, [room, players]);

  /* ── direction indicator ── */
  const dirArrow = room?.direction === -1 ? '⟲' : '⟳';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0e1a] via-[#0d1226] to-[#0a0e1a] text-white overflow-hidden">
      {/* ── Color picker modal ── */}
      {pickingColor && (
        <ColorPicker
          onPick={(color) => {
            const card = pickingColor;
            setPickingColor(null);
            handlePlay(card, color);
          }}
          onCancel={() => setPickingColor(null)}
        />
      )}

      {/* ── Winner overlay ── */}
      {isFinished && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="text-center space-y-6 animate-scaleIn">
            <div className="text-6xl">🏆</div>
            <h2 className="text-4xl font-black">
              {room?.winner_id === me?.id ? 'Ты победил!' : `${winnerName} побеждает!`}
            </h2>
            <div className="flex gap-3 justify-center">
              <Link
                href="/uno"
                className="rounded-xl bg-white/10 border border-white/20 px-6 py-3 font-bold hover:bg-white/20 transition"
              >
                В лобби
              </Link>
              <button
                onClick={() => router.push('/uno')}
                className="rounded-xl bg-[#e5383b] px-6 py-3 font-bold text-white hover:brightness-110 transition"
              >
                Новая игра
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* ── Header ── */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/uno" className="text-white/60 hover:text-white text-sm">← назад</Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                UNO
                <span className="text-sm font-mono bg-white/10 rounded-lg px-2 py-0.5 tracking-widest">{code}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            {room && (
              <>
                <span className={`inline-block w-2 h-2 rounded-full ${room.status === 'playing' ? 'bg-green-400 animate-pulse' : room.status === 'finished' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                <span>{room.status === 'lobby' ? 'Лобби' : room.status === 'playing' ? 'Игра' : 'Завершена'}</span>
                <span className="mx-1">·</span>
                <span>{room.mode === 'irregular-verbs' ? 'Глаголы' : 'Классика'}</span>
              </>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-[#ffb4b4]/30 bg-[#ffb4b4]/10 px-4 py-2 text-sm text-[#ffb4b4] flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-[#ffb4b4]/60 hover:text-white ml-2">✕</button>
          </div>
        )}

        {/* ── Lobby ── */}
        {room?.status === 'lobby' && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Ожидание игроков</h2>
                <p className="text-sm text-white/60">Поделитесь кодом <strong>{code}</strong> с друзьями</p>
              </div>
              <span className="text-3xl animate-pulse">⏳</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {players.map(p => (
                <div key={p.id} className={`rounded-xl px-3 py-2 text-sm border ${p.id === me?.id ? 'border-[#eab308] bg-[#eab308]/10 text-[#eab308]' : 'border-white/10 bg-white/5'}`}>
                  {p.name} {p.is_host ? '👑' : ''}
                </div>
              ))}
            </div>
            {me?.is_host && players.length >= 2 && (
              <button
                onClick={handleStart}
                disabled={pending}
                className="rounded-xl bg-[#e5383b] text-white font-bold px-6 py-3 text-sm tracking-wide hover:brightness-110 transition disabled:opacity-50"
              >
                {pending ? 'Запускаем…' : `🚀 Начать игру (${players.length} игроков)`}
              </button>
            )}
            {me?.is_host && players.length < 2 && (
              <p className="text-sm text-white/50">Нужно минимум 2 игрока для старта</p>
            )}
          </section>
        )}

        {/* ── Game Table ── */}
        {room?.status === 'playing' && (
          <>
            {/* Opponents bar */}
            <section className="flex flex-wrap gap-2 justify-center">
              {players.filter(p => p.id !== me?.id).map(p => {
                const hand = room.hands?.[p.id] as UnoCard[] | undefined;
                const count = hand?.length ?? 0;
                const isCurrent = room.current_player_id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl px-3 py-2 text-sm border transition-all duration-300
                      ${isCurrent ? 'border-[#eab308] bg-[#eab308]/15 shadow-lg shadow-[#eab308]/20 scale-105' : 'border-white/10 bg-white/5'}`}
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="ml-2 text-white/50">{count} 🃏</span>
                    {count === 1 && <span className="ml-1 text-[#e5383b] font-black text-xs animate-pulse">UNO!</span>}
                  </div>
                );
              })}
            </section>

            {/* Table center */}
            <section className="flex items-center justify-center gap-6 py-6">
              {/* Draw pile */}
              <button
                onClick={handleDraw}
                disabled={!myTurn || pending}
                className={`relative flex flex-col items-center gap-2 group transition-all
                  ${myTurn ? 'cursor-pointer hover:scale-105' : 'opacity-60 cursor-not-allowed'}`}
              >
                <div className="w-24 h-36 rounded-xl bg-[#1e293b] border-2 border-[#334155] flex items-center justify-center shadow-xl
                  group-hover:border-[#60a5fa] group-hover:shadow-[#60a5fa]/30 transition-all">
                  <span className="text-3xl font-black text-white/20">U</span>
                </div>
                <span className="text-xs text-white/50">{room.draw_pile?.length ?? 0}</span>
              </button>

              {/* Direction indicator */}
              <div className="text-4xl text-white/20 select-none">{dirArrow}</div>

              {/* Discard pile */}
              <div className="flex flex-col items-center gap-2">
                {topCard ? (
                  <UnoCardView card={topCard} size="lg" playable={false} disabled />
                ) : (
                  <div className="w-28 h-40 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center text-white/30 text-sm">
                    Сброс
                  </div>
                )}
                <span className="text-xs text-white/50">{room.discard_pile?.length ?? 0}</span>
              </div>
            </section>

            {/* Turn indicator */}
            <div className="text-center">
              {myTurn ? (
                <span className="inline-block rounded-full bg-[#eab308]/20 border border-[#eab308]/40 px-4 py-1.5 text-sm font-bold text-[#eab308] animate-pulse">
                  ⚡ Твой ход!
                </span>
              ) : (
                <span className="text-sm text-white/50">
                  Ходит: <strong>{currentPlayerName}</strong>
                </span>
              )}
            </div>

            {/* My hand */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold">Твои карты ({myHand.length})</span>
                {myHand.length === 1 && (
                  <span className="text-[#e5383b] font-black text-sm animate-pulse">UNO!</span>
                )}
              </div>

              {myHand.length === 0 ? (
                <p className="text-white/50 text-sm text-center py-6">Нет карт</p>
              ) : (
                <div className="flex flex-wrap gap-2 justify-center">
                  {myHand.map(card => {
                    const playable = cardPlayable(card, topCard);
                    return (
                      <UnoCardView
                        key={card.id}
                        card={card}
                        playable={playable && myTurn}
                        disabled={!playable || !myTurn || pending}
                        onClick={() => onCardClick(card)}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* ── Event log (subtle) ── */}
        {lastEvent && (
          <div className="text-center text-xs text-white/40 animate-fadeIn">{lastEvent}</div>
        )}
      </div>
    </div>
  );
}
