"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShareButton } from '@/shared/ui/ShareButton';
import { QRCodeCanvas } from 'qrcode.react';
import {
  cardPlayable,
  isZwischenzugPlayable,
  drawUnoCard,
  fetchUnoPlayers,
  fetchUnoRoomByCode,
  playUnoCard,
  zwischenzugUnoCard,
  startUnoGame,
  subscribeUnoPlayers,
  subscribeUnoRoom,
  unoStorage,
} from '@/lib/uno/api';
import type { UnoCard, UnoColor, UnoPlayer, UnoRoom } from '@/lib/uno/types';
import UnoCardView from '@/components/uno/UnoCardView';
import ColorPicker from '@/components/uno/ColorPicker';
import {
  sfxPlayCard, sfxDrawCard, sfxYourTurn,
  sfxWin, sfxLose, sfxWild, sfxPenalty, sfxAction,
  sfxGameStart, sfxClick,
  playLobbyMusic, stopLobbyMusic, playDuckSound,
} from '@/lib/uno/sounds';

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
  const prevStatusRef = useRef<string | null>(null);
  const prevPlayerCountRef = useRef<number>(0);
  const prevTurnRef = useRef<boolean>(false);

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
  const hasPlayable = useMemo(() => myHand.some(c => cardPlayable(c, topCard)), [myHand, topCard]);
  const hasZwischenzug = useMemo(() => !myTurn && room?.status === 'playing' && myHand.some(c => isZwischenzugPlayable(c, topCard)), [myTurn, room?.status, myHand, topCard]);
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

  /* ── sound triggers on state changes ── */
  /* ── lobby music ── */
  useEffect(() => {
    if (room?.status === 'lobby') {
      playLobbyMusic();
    } else {
      stopLobbyMusic();
    }
    return () => { stopLobbyMusic(); };
  }, [room?.status]);

  useEffect(() => {
    if (!room) return;
    if (prevStatusRef.current === 'lobby' && room.status === 'playing') sfxGameStart();
    if (prevStatusRef.current === 'playing' && room.status === 'finished') {
      if (room.winner_id === me?.id) sfxWin(); else sfxLose();
    }
    prevStatusRef.current = room.status;
  }, [room?.status, room?.winner_id, me?.id]);

  useEffect(() => {
    if (players.length > prevPlayerCountRef.current && prevPlayerCountRef.current > 0) playDuckSound();
    prevPlayerCountRef.current = players.length;
  }, [players.length]);

  useEffect(() => {
    if (myTurn && !prevTurnRef.current) sfxYourTurn();
    prevTurnRef.current = myTurn;
  }, [myTurn]);

  /* ── actions ── */
  const handleStart = async () => {
    if (!room) return;
    setPending(true);
    setError('');
    try {
      sfxClick();
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
      sfxDrawCard();
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
      if (card.kind === 'wild' || card.kind === 'wild4') sfxWild();
      else if (card.kind === 'draw2') sfxPenalty();
      else if (card.kind === 'skip' || card.kind === 'reverse') sfxAction();
      else sfxPlayCard();
      setLastEvent(`🃏 Сыграна карта`);
      if (res?.room) setRoom(res.room);
    } catch (e: any) { setError(e?.message ?? 'Нельзя сходить этой картой'); }
    finally { setPending(false); }
  };

  const handleZwischenzug = async (card: UnoCard) => {
    if (!room || !me) return;
    setPending(true);
    setError('');
    try {
      const res = await zwischenzugUnoCard({
        roomCode: room.code,
        playerId: me.id,
        cardId: card.id,
      });
      sfxPlayCard();
      setLastEvent(`⚡ ЦВИШЕНЦУГ!`);
      if (res?.room) setRoom(res.room);
    } catch (e: any) { setError(e?.message ?? 'Нельзя сыграть эту карту вне очереди'); }
    finally { setPending(false); }
  };

  const onCardClick = (card: UnoCard) => {
    if (myTurn) {
      if (card.kind === 'wild' || card.kind === 'wild4') {
        setPickingColor(card);
        return;
      }
      handlePlay(card);
    } else if (isZwischenzugPlayable(card, topCard)) {
      handleZwischenzug(card);
    }
  };

  const currentPlayerName = useMemo(() => {
    if (!room?.current_player_id) return null;
    return players.find(p => p.id === room.current_player_id)?.name ?? '...';
  }, [room, players]);

  /* ── direction indicator ── */
  const dirArrow = room?.direction === -1 ? '⟲' : '⟳';

  return (
    <div className="min-h-screen comic-bg-dots-yellow text-black overflow-hidden relative">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] comic-bg-rays-blue-cyan rounded-full opacity-30 blur-3xl mix-blend-overlay pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] comic-bg-rays-pink-purple rounded-full opacity-30 blur-3xl mix-blend-overlay pointer-events-none"></div>

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
          <div className="text-center space-y-6 animate-scaleIn comic-panel bg-white p-10 max-w-lg w-full mx-4 relative">
            <div className="absolute -top-10 -right-10 rotate-12 comic-speech-bubble bg-yellow-400 text-black font-black text-3xl px-6 py-4 z-20">
              ПОБЕДА!
            </div>
            <div className="text-8xl drop-shadow-[4px_4px_0_#000]">🏆</div>
            <h2 className="comic-font text-5xl text-red-500 drop-shadow-[2px_2px_0_#000]">
              {room?.winner_id === me?.id ? 'ТЫ ПОБЕДИЛ!' : `${winnerName} ПОБЕЖДАЕТ!`}
            </h2>
            <div className="flex flex-col gap-3 justify-center mt-6">
              <ShareButton
                rank={room?.winner_id === me?.id ? 1 : 2}
                points={null}
                gameName="UNO"
                className="comic-button bg-green-400 px-6 py-3 text-xl"
              />
              <a
                href="https://donatty.com/aleksandri"
                target="_blank"
                rel="noopener noreferrer"
                className="comic-button bg-yellow-400 px-6 py-3 text-xl"
              >
                💛 ПОДДЕРЖАТЬ ПРОЕКТ
              </a>
              <div className="flex gap-3">
                <Link
                  href="/uno"
                  className="comic-button bg-white flex-1 px-6 py-3 text-xl text-center"
                >
                  В ЛОББИ
                </Link>
                <button
                  onClick={() => router.push('/uno')}
                  className="comic-button bg-blue-500 text-white flex-1 px-6 py-3 text-xl"
                >
                  НОВАЯ ИГРА
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 space-y-6 relative z-10">
        {/* ── Header ── */}
        <header className="comic-panel bg-white p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/uno" className="comic-button bg-gray-200 px-3 py-1 text-sm">← НАЗАД</Link>
            <div>
              <h1 className="comic-font text-3xl text-red-500 drop-shadow-[2px_2px_0_#000] flex items-center gap-3">
                UNO
                <span className="comic-font-thin text-lg bg-yellow-400 text-black border-2 border-black px-3 py-1 rounded-lg shadow-[2px_2px_0_#000]">{code}</span>
              </h1>
              <a
                href="https://donatty.com/aleksandri"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block comic-font-thin text-xs font-bold bg-pink-400 text-white border-2 border-black px-2 py-1 shadow-[2px_2px_0_#000] hover:-translate-y-0.5 transition-transform"
              >
                💛 ПОДДЕРЖАТЬ ПРОЕКТ
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2 comic-font-thin font-bold text-sm bg-blue-100 border-2 border-black px-3 py-2 rounded-xl shadow-[2px_2px_0_#000]">
            {room && (
              <>
                <span className={`inline-block w-3 h-3 rounded-full border-2 border-black ${room.status === 'playing' ? 'bg-green-400 animate-pulse' : room.status === 'finished' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                <span className="uppercase">{room.status === 'lobby' ? 'ЛОББИ' : room.status === 'playing' ? 'ИГРА' : 'ЗАВЕРШЕНА'}</span>
                <span className="mx-1">·</span>
                <span className="uppercase text-blue-600">{room.mode === 'irregular-verbs' ? 'ВСЕ ФОРМЫ' : room.mode === 'verb-match' ? 'УГАДАЙ ГЛАГОЛ' : room.mode === 'classic-verbs' ? 'КЛАССИКА + ГЛАГОЛЫ' : 'КЛАССИКА'}</span>
              </>
            )}
          </div>
        </header>

        {error && (
          <div className="comic-panel bg-red-100 p-3 text-red-600 comic-font-thin font-bold flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-800 hover:text-red-500 text-xl">✕</button>
          </div>
        )}

        {/* ── Lobby ── */}
        {room?.status === 'lobby' && (
          <section className="comic-panel bg-yellow-100 p-6 space-y-6 relative">
            <div className="absolute -top-4 -left-4 -rotate-6 bg-blue-500 text-white comic-font text-xl px-4 py-1 border-4 border-black shadow-[4px_4px_0_#000]">
              ОЖИДАНИЕ
            </div>
            <div className="flex items-center justify-between pt-2">
              <div>
                <h2 className="comic-font text-3xl text-blue-600 drop-shadow-[1px_1px_0_#000]">ЖДЕМ ИГРОКОВ...</h2>
                <p className="comic-font-thin font-bold text-lg mt-1">ПОДЕЛИТЕСЬ КОДОМ <strong className="bg-white border-2 border-black px-2 py-0.5 rounded">{code}</strong> ИЛИ СКАНИРУЙТЕ QR</p>
              </div>
              <span className="text-5xl animate-bounce drop-shadow-[2px_2px_0_#000]">⏳</span>
            </div>
            {typeof window !== 'undefined' && (
              <div className="text-center space-y-2">
                <div className="bg-white rounded-2xl p-4 inline-block border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <QRCodeCanvas value={`${window.location.origin}/uno?code=${code}`} size={200} fgColor="#000000" bgColor="#ffffff" />
                </div>
                <p className="text-xs text-gray-500 font-bold break-all">{`${window.location.origin}/uno?code=${code}`}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              {players.map(p => (
                <div key={p.id} className={`comic-panel px-4 py-2 text-lg comic-font-thin font-bold ${p.id === me?.id ? 'bg-green-400 text-white' : 'bg-white text-black'}`}>
                  {p.name} {p.is_host ? '👑' : ''}
                </div>
              ))}
            </div>
            {me?.is_host && players.length >= 2 && (
              <button
                onClick={handleStart}
                disabled={pending}
                className="comic-button bg-red-500 text-white text-2xl py-4 w-full mt-4"
              >
                {pending ? 'ЗАПУСКАЕМ...' : `🚀 НАЧАТЬ ИГРУ (${players.length} ИГРОКОВ)`}
              </button>
            )}
            {me?.is_host && players.length < 2 && (
              <p className="comic-font-thin font-bold text-red-600 text-center mt-4">НУЖНО МИНИМУМ 2 ИГРОКА ДЛЯ СТАРТА</p>
            )}
          </section>
        )}

        {/* ── Game Table ── */}
        {room?.status === 'playing' && (
          <>
            {/* Opponents bar */}
            <section className="flex flex-wrap gap-3 justify-center">
              {players.filter(p => p.id !== me?.id).map(p => {
                const hand = room.hands?.[p.id] as UnoCard[] | undefined;
                const count = hand?.length ?? 0;
                const isCurrent = room.current_player_id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`comic-panel px-4 py-2 flex items-center gap-2 transition-all duration-300
                      ${isCurrent ? 'bg-yellow-400 scale-110 z-10' : 'bg-white'}`}
                  >
                    <span className="comic-font-thin font-bold text-lg">{p.name}</span>
                    <span className="comic-font text-xl bg-black text-white px-2 py-0.5 rounded">{count}</span>
                    {count === 1 && <span className="comic-font text-red-500 text-xl animate-pulse drop-shadow-[1px_1px_0_#000]">UNO!</span>}
                  </div>
                );
              })}
            </section>

            {/* Table center */}
            <section className="flex items-center justify-center gap-8 py-8 relative">
              {/* Draw pile */}
              <button
                onClick={handleDraw}
                disabled={!myTurn || pending}
                className={`relative flex flex-col items-center gap-2 group transition-all
                  ${myTurn ? 'cursor-pointer hover:scale-105' : 'opacity-80 cursor-not-allowed'}`}
              >
                <div className={`w-24 h-36 comic-panel bg-blue-500 flex items-center justify-center transition-all
                  ${myTurn && !hasPlayable ? 'ring-4 ring-yellow-400 ring-offset-4 ring-offset-black animate-pulse' : ''}`}>
                  <span className="comic-font text-6xl text-white drop-shadow-[3px_3px_0_#000]">U</span>
                </div>
                <span className="comic-font-thin font-bold text-black bg-white border-2 border-black px-2 py-0.5 rounded-full shadow-[2px_2px_0_#000]">{room.draw_pile?.length ?? 0}</span>
                {myTurn && !hasPlayable && (
                  <span className="absolute -top-8 -left-8 rotate-[-15deg] comic-speech-bubble bg-yellow-400 text-black comic-font text-lg px-3 py-1 z-20 whitespace-nowrap">
                    БЕРИ!
                  </span>
                )}
              </button>

              {/* Direction indicator */}
              <div className="comic-font text-6xl text-black drop-shadow-[2px_2px_0_#fff] select-none">{dirArrow}</div>

              {/* Discard pile */}
              <div className="flex flex-col items-center gap-2 relative">
                {topCard ? (
                  <UnoCardView card={topCard} size="lg" playable={false} disabled />
                ) : (
                  <div className="w-28 h-40 comic-panel bg-gray-200 flex items-center justify-center text-gray-500 comic-font text-xl">
                    СБРОС
                  </div>
                )}
                <span className="comic-font-thin font-bold text-black bg-white border-2 border-black px-2 py-0.5 rounded-full shadow-[2px_2px_0_#000]">{room.discard_pile?.length ?? 0}</span>
              </div>
            </section>

            {/* Turn indicator */}
            <div className="text-center my-4">
              {myTurn ? (
                <span className="inline-block comic-panel bg-yellow-400 px-6 py-2 comic-font text-3xl text-red-600 drop-shadow-[1px_1px_0_#000] animate-pulse">
                  ⚡ ТВОЙ ХОД!
                </span>
              ) : (
                <span className="comic-panel bg-white px-4 py-2 comic-font-thin font-bold text-lg">
                  ХОДИТ: <strong className="comic-font text-xl text-blue-600">{currentPlayerName}</strong>
                </span>
              )}
              {hasZwischenzug && (
                <div className="mt-2">
                  <span className="inline-block comic-panel bg-purple-400 px-4 py-1 comic-font text-xl text-white drop-shadow-[1px_1px_0_#000] animate-pulse">
                    ⚡ ЦВИШЕНЦУГ ДОСТУПЕН!
                  </span>
                </div>
              )}
            </div>

            {/* My hand */}
            <section className="comic-panel bg-pink-100 p-6 relative">
              <div className="absolute -top-4 -left-4 -rotate-3 bg-green-400 text-black comic-font text-xl px-4 py-1 border-4 border-black shadow-[4px_4px_0_#000]">
                ТВОИ КАРТЫ
              </div>
              <div className="flex items-center justify-between mb-4 pt-2">
                <span className="comic-font-thin font-bold text-xl">ВСЕГО: {myHand.length}</span>
                {myHand.length === 1 && (
                  <span className="comic-font text-3xl text-red-500 drop-shadow-[2px_2px_0_#000] animate-pulse">UNO!</span>
                )}
              </div>

              {myHand.length === 0 ? (
                <p className="comic-font-thin font-bold text-black/50 text-center py-6 text-xl">НЕТ КАРТ</p>
              ) : (
                <div className="flex flex-wrap gap-3 justify-center">
                  {myHand.map(card => {
                    const playable = cardPlayable(card, topCard);
                    const canZwischenzug = !myTurn && isZwischenzugPlayable(card, topCard);
                    return (
                      <UnoCardView
                        key={card.id}
                        card={card}
                        playable={(playable && myTurn) || canZwischenzug}
                        disabled={(!playable || !myTurn) && !canZwischenzug || pending}
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
          <div className="fixed bottom-4 right-4 comic-speech-bubble bg-white text-black comic-font text-xl px-4 py-2 z-50 animate-fadeIn">
            {lastEvent}
          </div>
        )}
      </div>
    </div>
  );
}
