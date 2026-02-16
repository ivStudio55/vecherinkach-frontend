"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchDrawRoom,
  fetchDrawPlayers,
  fetchDrawChains,
  fetchDrawSteps,
  fetchSubmittedCount,
  subscribeDrawRoom,
  subscribeDrawPlayers,
  subscribeDrawSteps,
  startRound,
  advanceStep,
  advanceVotingChain,
  finishVoting,
  nextRoundOrFinish,
  awardVotePoints,
  drawStorage,
} from '@/lib/draw/api';
import type { DrawRoom, DrawPlayer, DrawChain, DrawStep } from '@/lib/draw/types';
import { roundLabel } from '@/lib/draw/types';
import ChainViewer from '@/components/draw/ChainViewer';

export default function DrawHostPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code || '').toString().toUpperCase();

  const [room, setRoom] = useState<DrawRoom | null>(null);
  const [players, setPlayers] = useState<DrawPlayer[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // Playing state
  const [submittedCount, setSubmittedCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);

  // Voting state
  const [chains, setChains] = useState<DrawChain[]>([]);
  const [allSteps, setAllSteps] = useState<DrawStep[]>([]);
  const [votingDone, setVotingDone] = useState(false);
  const [showingChain, setShowingChain] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Load room + players ── */
  const refresh = useCallback(async () => {
    try {
      const r = await fetchDrawRoom(code);
      setRoom(r);
      const p = await fetchDrawPlayers(r.id);
      setPlayers(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }, [code]);

  useEffect(() => { refresh(); }, [refresh]);

  /* ── Subscriptions ── */
  useEffect(() => {
    if (!room) return;
    const offRoom = subscribeDrawRoom(room.id, (updated) => {
      setRoom(updated);
    });
    const offPlayers = subscribeDrawPlayers(room.id, () => {
      fetchDrawPlayers(room.id).then(p => setPlayers(p)).catch(() => {});
    });
    const offSteps = subscribeDrawSteps(room.id, () => {
      // trigger submission check
      if (room.status === 'playing') {
        checkSubmissions();
      }
    });
    return () => { offRoom(); offPlayers(); offSteps(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, room?.status]);

  /* ── Poll submissions during playing ── */
  const checkSubmissions = useCallback(async () => {
    if (!room || room.status !== 'playing') return;
    try {
      const c = await fetchDrawChains(room.id, room.current_round);
      const ids = c.map(ch => ch.id);
      const count = await fetchSubmittedCount(ids, room.current_step);
      setSubmittedCount(count);
    } catch { /* ignore */ }
  }, [room]);

  useEffect(() => {
    if (!room || room.status !== 'playing') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    checkSubmissions();
    pollRef.current = setInterval(checkSubmissions, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [room?.status, room?.current_step, checkSubmissions]);

  /* ── Timer ── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!room || room.status !== 'playing' || !room.step_started_at) return;

    const tick = () => {
      const deadline = new Date(room.step_started_at!).getTime() + room.step_duration * 1000;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.status, room?.step_started_at, room?.step_duration]);

  /* ── Load chains + steps for voting/results ── */
  useEffect(() => {
    if (!room || (room.status !== 'voting' && room.status !== 'results' && room.status !== 'finished')) return;
    (async () => {
      try {
        // Load all chains and steps for current round (or all rounds for finished)
        if (room.status === 'finished') {
          // Load all rounds
          const allChains: DrawChain[] = [];
          const allS: DrawStep[] = [];
          for (let r = 1; r <= 3; r++) {
            const c = await fetchDrawChains(room.id, r);
            allChains.push(...c);
            if (c.length > 0) {
              const s = await fetchDrawSteps(c.map(ch => ch.id));
              allS.push(...s);
            }
          }
          setChains(allChains);
          setAllSteps(allS);
        } else {
          const c = await fetchDrawChains(room.id, room.current_round);
          setChains(c);
          if (c.length > 0) {
            const s = await fetchDrawSteps(c.map(ch => ch.id));
            setAllSteps(s);
          }
        }
      } catch { /* ignore */ }
    })();
  }, [room?.status, room?.current_round, room?.voting_chain_index]);

  /* ── Refresh players for scores ── */
  useEffect(() => {
    if (!room || (room.status !== 'results' && room.status !== 'finished')) return;
    fetchDrawPlayers(room.id).then(p => setPlayers(p)).catch(() => {});
  }, [room?.status]);

  /* ── Actions ── */
  const handleStartGame = async () => {
    if (!room || players.length < 3) return;
    setPending(true);
    try {
      await startRound(room.id, 1, players);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setPending(false);
    }
  };

  const handleAdvanceStep = async () => {
    if (!room) return;
    setPending(true);
    try {
      await advanceStep(room);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setPending(false);
    }
  };

  const handleNextChain = async () => {
    if (!room) return;
    const roundChains = chains.filter(c => c.round === room.current_round);
    if (room.voting_chain_index >= roundChains.length - 1) {
      // All chains reviewed -> finish voting
      setPending(true);
      try {
        await awardVotePoints(room.id, room.current_round);
        await finishVoting(room.id);
        await fetchDrawPlayers(room.id).then(p => setPlayers(p));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        setPending(false);
      }
    } else {
      setShowingChain(true);
      await advanceVotingChain(room);
    }
  };

  const handleNextRound = async () => {
    if (!room) return;
    setPending(true);
    try {
      await nextRoundOrFinish(room, players);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setPending(false);
    }
  };

  /* ── Derived ── */
  const sortedPlayers = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players]);
  const totalPlayers = players.length;
  const roundChains = useMemo(
    () => chains.filter(c => c.round === (room?.current_round || 0)),
    [chains, room?.current_round],
  );
  const currentChain = roundChains[room?.voting_chain_index || 0] || null;
  const currentChainSteps = useMemo(
    () => currentChain ? allSteps.filter(s => s.chain_id === currentChain.id).sort((a, b) => a.step_number - b.step_number) : [],
    [currentChain, allSteps],
  );

  /* ── Auto-advance when all submitted or timer expired ── */
  useEffect(() => {
    if (!room || room.status !== 'playing') return;
    if (submittedCount >= totalPlayers && totalPlayers > 0) {
      // All submitted → auto-advance after 2 seconds
      const t = setTimeout(() => advanceStep(room), 2000);
      return () => clearTimeout(t);
    }
    if (timeLeft <= 0 && totalPlayers > 0) {
      // Timer expired → auto-advance after 1 second
      const t = setTimeout(() => advanceStep(room), 1000);
      return () => clearTimeout(t);
    }
  }, [submittedCount, totalPlayers, timeLeft, room]);

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0a2e] via-[#16213e] to-[#0f3460] text-white flex items-center justify-center">
        <p className="text-xl">{error || 'Загрузка…'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0a2e] via-[#16213e] to-[#0f3460] text-white">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <header className="rounded-3xl border-4 border-white/10 bg-white/5 backdrop-blur px-8 py-6 shadow-2xl flex items-center justify-between">
          <div>
            <p className="uppercase text-xs tracking-[0.5em] text-white/60">🎨 Рисункач</p>
            <h1 className="text-4xl font-black">Комната: {code}</h1>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/60">Статус</p>
            <p className="text-lg font-bold capitalize">{
              room.status === 'lobby' ? '⏳ Лобби' :
              room.status === 'playing' ? `🎮 Раунд ${room.current_round}` :
              room.status === 'voting' ? '🗳️ Голосование' :
              room.status === 'results' ? '📊 Результаты' :
              '🏆 Финал'
            }</p>
          </div>
        </header>

        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-400/30 px-4 py-3 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* ═══════════ LOBBY ═══════════ */}
        {room.status === 'lobby' && (
          <div className="space-y-6">
            <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-8 text-center space-y-6">
              <div>
                <p className="text-sm text-white/60 mb-2">Код для подключения</p>
                <p className="text-7xl font-black tracking-[0.3em] text-purple-300">{code}</p>
                <p className="mt-2 text-sm text-white/50">Игроки вводят этот код на своих телефонах</p>
              </div>

              <div>
                <p className="text-sm text-white/60 mb-3">Игроки ({players.length})</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {players.map(p => (
                    <div key={p.id} className="rounded-2xl border-2 border-white/20 bg-white/10 px-5 py-3 text-sm font-bold">
                      {p.is_host ? '👑 ' : ''}{p.name}
                    </div>
                  ))}
                  {players.length === 0 && <p className="text-white/40">Пока никого…</p>}
                </div>
              </div>

              <button
                onClick={handleStartGame}
                disabled={pending || players.length < 3}
                className="px-12 py-4 rounded-2xl bg-purple-600 text-white text-xl font-black tracking-[0.1em] hover:bg-purple-500 disabled:opacity-40 active:scale-95 transition"
              >
                {players.length < 3 ? `Нужно минимум 3 игрока (сейчас ${players.length})` : '🚀 Начать игру!'}
              </button>
            </section>
          </div>
        )}

        {/* ═══════════ PLAYING ═══════════ */}
        {room.status === 'playing' && (
          <div className="space-y-6">
            {/* Round info */}
            <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-8 text-center space-y-4">
              <div className="flex items-center justify-center gap-6 text-lg">
                <div>
                  <span className="text-white/60 text-sm">Раунд</span>
                  <p className="text-4xl font-black text-purple-300">{room.current_round}</p>
                </div>
                <div className="w-px h-12 bg-white/20" />
                <div>
                  <span className="text-white/60 text-sm">Шаг</span>
                  <p className="text-4xl font-black">{room.current_step} / {room.total_steps}</p>
                </div>
                <div className="w-px h-12 bg-white/20" />
                <div>
                  <span className="text-white/60 text-sm">Таймер</span>
                  <p className={`text-4xl font-black ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-green-400'}`}>
                    {timeLeft}с
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-purple-500/20 border border-purple-400/30 px-4 py-2 inline-block">
                <span className="text-sm font-bold text-purple-300">{roundLabel(room.current_round)}</span>
              </div>

              <p className="text-sm text-white/60">
                {room.current_step === 1
                  ? 'Игроки получили слова и рисуют…'
                  : 'Игроки угадывают и рисуют…'}
              </p>
            </section>

            {/* Submission status */}
            <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black">Статус игроков</h2>
                <span className="text-lg font-bold text-purple-300">{submittedCount}/{totalPlayers}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {players.map((p, i) => (
                  <div
                    key={p.id}
                    className={`rounded-xl border-2 px-4 py-3 text-center text-sm font-bold transition-all ${
                      i < submittedCount ? 'border-green-400/50 bg-green-400/10 text-green-300' : 'border-white/10 bg-white/5 text-white/60'
                    }`}
                  >
                    {i < submittedCount ? '✅ ' : '⏳ '}{p.name}
                  </div>
                ))}
              </div>
              {submittedCount >= totalPlayers && (
                <p className="text-center text-green-400 font-bold mt-4 animate-pulse">
                  Все готовы! Переход к следующему шагу…
                </p>
              )}
              <div className="mt-4 text-center">
                <button
                  onClick={handleAdvanceStep}
                  disabled={pending}
                  className="px-6 py-2 rounded-xl border border-white/20 bg-white/10 text-sm font-bold hover:bg-white/20 disabled:opacity-40 transition"
                >
                  Пропустить таймер →
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ═══════════ VOTING ═══════════ */}
        {room.status === 'voting' && (
          <div className="space-y-6">
            <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-8 text-center space-y-2">
              <p className="text-sm text-white/60">Голосование после раунда {room.current_round}</p>
              <h2 className="text-3xl font-black">
                Цепочка {(room.voting_chain_index || 0) + 1} из {roundChains.length}
              </h2>
              <p className="text-white/60 text-sm">Смотрим как менялся рисунок от слова к слову</p>
            </section>

            {/* Chain viewer */}
            {currentChain && (
              <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-8">
                <ChainViewer
                  originalWord={currentChain.original_word}
                  steps={currentChainSteps}
                  players={players}
                  animated={showingChain}
                />
              </section>
            )}

            {/* Final drawings for voting */}
            <section className="rounded-3xl border-4 border-yellow-400/20 bg-yellow-400/5 p-6 text-center space-y-4">
              <h3 className="text-xl font-black text-yellow-300">🗳️ Игроки голосуют на своих телефонах!</h3>
              <p className="text-sm text-white/60">
                Каждый выбирает лучший финальный рисунок этой цепочки
              </p>
            </section>

            <div className="text-center">
              <button
                onClick={handleNextChain}
                disabled={pending}
                className="px-8 py-3 rounded-2xl bg-purple-600 text-white font-bold text-lg hover:bg-purple-500 disabled:opacity-40 active:scale-95 transition"
              >
                {(room.voting_chain_index || 0) >= roundChains.length - 1
                  ? '📊 Показать результаты'
                  : `Следующая цепочка →`}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════ RESULTS ═══════════ */}
        {room.status === 'results' && (
          <div className="space-y-6">
            <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-8 text-center space-y-2">
              <p className="text-sm text-white/60">Результаты раунда {room.current_round}</p>
              <h2 className="text-3xl font-black">📊 Таблица лидеров</h2>
            </section>

            <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-6">
              <div className="space-y-3">
                {sortedPlayers.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-2xl border-2 px-6 py-4 ${
                      i === 0 ? 'border-yellow-400/50 bg-yellow-400/10' :
                      i === 1 ? 'border-gray-300/30 bg-gray-300/5' :
                      i === 2 ? 'border-amber-600/30 bg-amber-600/5' :
                      'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                      </span>
                      <span className="text-xl font-bold">{p.name}</span>
                    </div>
                    <span className="text-2xl font-black text-purple-300">{p.score}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="text-center">
              <button
                onClick={handleNextRound}
                disabled={pending}
                className="px-8 py-4 rounded-2xl bg-purple-600 text-white font-bold text-xl hover:bg-purple-500 disabled:opacity-40 active:scale-95 transition"
              >
                {room.current_round >= 3
                  ? '🏆 Финальные результаты'
                  : `🚀 Начать раунд ${room.current_round + 1}`}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════ FINISHED ═══════════ */}
        {room.status === 'finished' && (
          <div className="space-y-6">
            <section className="rounded-3xl border-4 border-yellow-400/30 bg-yellow-400/5 p-8 text-center space-y-4">
              <p className="text-6xl">🏆</p>
              <h2 className="text-4xl font-black">Игра окончена!</h2>
              {sortedPlayers[0] && (
                <p className="text-2xl text-yellow-300 font-bold">
                  Победитель: {sortedPlayers[0].name} — {sortedPlayers[0].score} баллов!
                </p>
              )}
            </section>

            <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-6">
              <h3 className="text-xl font-black mb-4 text-center">Финальная таблица</h3>
              <div className="space-y-3">
                {sortedPlayers.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-2xl border-2 px-6 py-4 ${
                      i === 0 ? 'border-yellow-400/50 bg-yellow-400/10' :
                      i === 1 ? 'border-gray-300/30 bg-gray-300/5' :
                      i === 2 ? 'border-amber-600/30 bg-amber-600/5' :
                      'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                      </span>
                      <span className="text-xl font-bold">{p.name}</span>
                    </div>
                    <span className="text-2xl font-black text-purple-300">{p.score}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex justify-center gap-4">
              <Link
                href="/draw"
                className="px-6 py-3 rounded-2xl border border-white/20 bg-white/10 font-bold hover:bg-white/20 transition"
              >
                Новая игра
              </Link>
              <Link
                href="/"
                className="px-6 py-3 rounded-2xl border border-purple-400/30 bg-purple-600 font-bold hover:bg-purple-500 transition"
              >
                На главную
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
