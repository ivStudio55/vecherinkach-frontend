"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchDrawRoom,
  fetchDrawPlayers,
  fetchDrawChains,
  fetchDrawSteps,
  fetchMyStep,
  fetchPreviousStepDrawing,
  subscribeDrawRoom,
  subscribeDrawPlayers,
  submitDrawingStep1,
  submitGuessAndDrawing,
  castVote,
  submitFreeWord,
  drawStorage,
} from '@/lib/draw/api';
import type { DrawRoom, DrawPlayer, DrawChain, DrawStep } from '@/lib/draw/types';
import { maxStrokesForRound, roundLabel } from '@/lib/draw/types';
import DrawCanvas from '@/components/draw/DrawCanvas';

type PlayerPhase = 'waiting' | 'free-word' | 'drawing' | 'guessing' | 'drawing-guess' | 'submitted' | 'voting' | 'results' | 'finished';

export default function DrawRoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code || '').toString().toUpperCase();

  const [room, setRoom] = useState<DrawRoom | null>(null);
  const [players, setPlayers] = useState<DrawPlayer[]>([]);
  const [error, setError] = useState('');

  // Current step data
  const [myStep, setMyStep] = useState<DrawStep | null>(null);
  const [previousStep, setPreviousStep] = useState<DrawStep | null>(null);
  const [phase, setPhase] = useState<PlayerPhase>('waiting');
  const [guess, setGuess] = useState('');
  const [guessResult, setGuessResult] = useState<{ isCorrect: boolean } | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [freeWord, setFreeWord] = useState('');

  // Voting data
  const [chains, setChains] = useState<DrawChain[]>([]);
  const [allSteps, setAllSteps] = useState<DrawStep[]>([]);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [votePending, setVotePending] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const session = useMemo(() => {
    if (typeof window === 'undefined') return { playerId: null, playerName: null, roomCode: null, roomId: null };
    return drawStorage.get();
  }, []);

  const me = useMemo(() => players.find(p => p.id === session.playerId), [players, session.playerId]);
  const myScore = me?.score || 0;
  const gamePlayers = useMemo(() => players.filter(p => !p.is_host), [players]);

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
    return () => { offRoom(); offPlayers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  /* ── Load step data when room state changes ── */
  useEffect(() => {
    if (!room || !session.playerId) return;

    if (room.status === 'playing') {
      (async () => {
        try {
          const c = await fetchDrawChains(room.id, room.current_round);
          const chainIds = c.map(ch => ch.id);
          const step = await fetchMyStep(chainIds, room.current_step, session.playerId!);
          setMyStep(step);

          if (step && room.current_step > 1) {
            const prev = await fetchPreviousStepDrawing(step.chain_id, step.step_number);
            setPreviousStep(prev);
          } else {
            setPreviousStep(null);
          }

          // Determine phase
          if (!step) {
            setPhase('waiting');
          } else if (step.submitted) {
            setPhase('submitted');
          } else if (room.current_step === 1) {
            // Free mode: player must enter their own word first
            if (room.mode === 'free' && (!step.target_word || step.target_word.startsWith('__FREE_'))) {
              setPhase('free-word');
            } else {
              setPhase('drawing');
            }
          } else {
            setPhase('guessing');
          }

          // Reset state for new step
          setGuess('');
          setGuessResult(null);
        } catch { /* ignore */ }
      })();
    } else if (room.status === 'voting') {
      setPhase('voting');
      // Load chains and steps for voting (also re-loads when voting_chain_index changes)
      (async () => {
        try {
          const c = await fetchDrawChains(room.id, room.current_round);
          setChains(c);
          if (c.length > 0) {
            const s = await fetchDrawSteps(c.map(ch => ch.id));
            setAllSteps(s);
          }
        } catch { /* ignore */ }
      })();
    } else if (room.status === 'results') {
      setPhase('results');
      fetchDrawPlayers(room.id).then(p => setPlayers(p)).catch(() => {});
    } else if (room.status === 'finished') {
      setPhase('finished');
      fetchDrawPlayers(room.id).then(p => setPlayers(p)).catch(() => {});
    } else {
      setPhase('waiting');
    }
  }, [room?.status, room?.current_round, room?.current_step, session.playerId, room?.id, room?.voting_chain_index]);

  /* ── Reset vote when chain changes ── */
  useEffect(() => {
    setMyVote(null);
  }, [room?.voting_chain_index]);

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

  /* ── Actions ── */
  const handleSubmitDrawing = async (dataUrl: string) => {
    if (!myStep) return;
    try {
      await submitDrawingStep1(myStep.id, dataUrl);
      setPhase('submitted');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    }
  };

  const handleConfirmGuess = () => {
    if (!guess.trim()) return;
    setPhase('drawing-guess');
  };

  const handleSubmitFreeWord = async () => {
    if (!freeWord.trim() || !myStep) return;
    try {
      await submitFreeWord(myStep.id, freeWord.trim());
      setMyStep({ ...myStep, target_word: freeWord.trim() });
      setFreeWord('');
      setPhase('drawing');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleSubmitGuessAndDrawing = async (dataUrl: string) => {
    if (!myStep || !previousStep) return;
    try {
      const result = await submitGuessAndDrawing(myStep.id, guess, dataUrl, previousStep);
      setGuessResult(result);
      setPhase('submitted');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    }
  };

  const handleVote = async (playerId: string) => {
    if (!room || !session.playerId || !chains.length) return;
    const roundChains = chains.filter(c => c.round === room.current_round);
    const currentChain = roundChains[room.voting_chain_index || 0];
    if (!currentChain) return;

    setVotePending(true);
    try {
      await castVote(room.id, room.current_round, currentChain.id, session.playerId, playerId);
      setMyVote(playerId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка голосования');
    } finally {
      setVotePending(false);
    }
  };

  /* ── Derived ── */
  const strokeLimit = room ? maxStrokesForRound(room.current_round) : undefined;
  const sortedPlayers = useMemo(() => [...gamePlayers].sort((a, b) => b.score - a.score), [gamePlayers]);

  // For voting: get drawings from the current chain (matching host's view)
  const currentChainDrawings = useMemo(() => {
    if (!room || !chains.length) return [];
    const roundChains = chains.filter(c => c.round === room.current_round);
    const currentChain = roundChains[room.voting_chain_index || 0];
    if (!currentChain) return [];

    return allSteps
      .filter(s => s.chain_id === currentChain.id && s.drawing_data)
      .sort((a, b) => a.step_number - b.step_number)
      .map(step => ({
        step,
        chain: currentChain,
        playerName: players.find(p => p.id === step.player_id)?.name || '???',
        playerId: step.player_id,
      }));
  }, [chains, allSteps, players, room]);

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0a2e] via-[#16213e] to-[#0f3460] text-white flex items-center justify-center p-4">
        <p className="text-lg">{error || 'Загрузка…'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0a2e] via-[#16213e] to-[#0f3460] text-white">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Mini header */}
        <header className="flex items-center justify-between rounded-2xl border-2 border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm">
            <span className="text-white/60">🎨 Рисункач</span>
            {room.status === 'playing' && (
              <span className="ml-2 text-purple-300 font-bold">
                Р{room.current_round} · Шаг {room.current_step}/{room.total_steps}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {room.status === 'playing' && (
              <span className={`text-lg font-black ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-green-400'}`}>
                {timeLeft}с
              </span>
            )}
            <span className="text-xs text-white/60">⭐ {myScore}</span>
          </div>
        </header>

        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-400/30 px-3 py-2 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* ═══════════ LOBBY ═══════════ */}
        {room.status === 'lobby' && (
          <section className="rounded-2xl border-2 border-white/10 bg-white/5 p-6 text-center space-y-4">
            <p className="text-3xl">🎨</p>
            <h2 className="text-xl font-black">Ожидание начала игры</h2>
            <p className="text-sm text-white/60">Код: <span className="text-purple-300 font-bold text-lg">{code}</span></p>
            <div>
              <p className="text-xs text-white/50 mb-2">Игроки ({gamePlayers.length})</p>
              <div className="flex flex-wrap justify-center gap-2">
                {gamePlayers.map(p => (
                  <span
                    key={p.id}
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${
                      p.id === session.playerId ? 'border-purple-400 bg-purple-400/20 text-purple-300' : 'border-white/20 bg-white/5 text-white/70'
                    }`}
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-white/40">Ведущий скоро начнёт игру…</p>
          </section>
        )}

        {/* ═══════════ FREE MODE: ENTER WORD ═══════════ */}
        {phase === 'free-word' && myStep && (
          <section className="space-y-4">
            <div className="rounded-xl border border-purple-400/30 bg-purple-400/10 px-4 py-2 text-center">
              <span className="text-xs text-white/60">✏️ Свободный режим</span>
            </div>
            <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-6 text-center space-y-4">
              <p className="text-lg font-bold">Придумай слово для рисования!</p>
              <input
                className="w-full rounded-xl bg-white/10 border-2 border-white/20 px-4 py-3 text-lg text-center font-bold focus:outline-none focus:border-purple-400 text-white placeholder-white/30"
                value={freeWord}
                onChange={e => setFreeWord(e.target.value)}
                placeholder="Введи слово…"
                autoFocus
              />
              <button
                onClick={handleSubmitFreeWord}
                disabled={!freeWord.trim()}
                className="w-full rounded-xl bg-purple-600 text-white font-bold px-4 py-3 text-lg disabled:opacity-40 active:scale-95 transition"
              >
                Далее → Рисовать
              </button>
            </div>
          </section>
        )}

        {/* ═══════════ DRAWING (Step 1) ═══════════ */}
        {phase === 'drawing' && myStep && (
          <section className="space-y-3">
            <div className="rounded-xl border border-purple-400/30 bg-purple-400/10 px-4 py-2 text-center">
              <span className="text-xs text-white/60">{roundLabel(room.current_round)}</span>
            </div>
            <DrawCanvas
              maxStrokes={strokeLimit}
              onSubmit={handleSubmitDrawing}
              word={myStep.target_word || ''}
            />
          </section>
        )}

        {/* ═══════════ GUESSING (Step 2+) ═══════════ */}
        {phase === 'guessing' && previousStep && (
          <section className="space-y-4">
            <div className="rounded-xl border border-purple-400/30 bg-purple-400/10 px-4 py-2 text-center">
              <span className="text-xs text-white/60">{roundLabel(room.current_round)}</span>
            </div>

            <div className="text-center">
              <span className="text-xs uppercase tracking-[0.3em] text-white/60">Что здесь нарисовано?</span>
            </div>

            {/* Previous drawing */}
            <div className="rounded-2xl border-2 border-white/20 overflow-hidden">
              {previousStep.drawing_data ? (
                <img
                  src={previousStep.drawing_data}
                  alt="Рисунок для угадывания"
                  className="w-full aspect-square object-contain bg-white"
                />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center bg-white/10 text-white/40">
                  Пустой рисунок
                </div>
              )}
            </div>

            <div className="space-y-3">
              <input
                className="w-full rounded-xl bg-white/10 border-2 border-white/20 px-4 py-3 text-lg text-center font-bold focus:outline-none focus:border-purple-400 text-white placeholder-white/30"
                value={guess}
                onChange={e => setGuess(e.target.value)}
                placeholder="Напиши свою догадку…"
                autoFocus
              />
              <button
                onClick={handleConfirmGuess}
                disabled={!guess.trim()}
                className="w-full rounded-xl bg-purple-600 text-white font-bold px-4 py-3 text-lg disabled:opacity-40 active:scale-95 transition"
              >
                Далее → Рисовать
              </button>
            </div>
          </section>
        )}

        {/* ═══════════ DRAWING GUESS (Step 2+ after guessing) ═══════════ */}
        {phase === 'drawing-guess' && (
          <section className="space-y-3">
            {guessResult && (
              <div className={`rounded-xl border px-4 py-3 text-center ${
                guessResult.isCorrect ? 'border-green-400/50 bg-green-400/10 text-green-300' : 'border-red-400/40 bg-red-400/10 text-red-300'
              }`}>
                {guessResult.isCorrect ? '🎉 +50 баллов! Правильно!' : ''}
              </div>
            )}
            <DrawCanvas
              maxStrokes={strokeLimit}
              onSubmit={handleSubmitGuessAndDrawing}
              word={guess}
            />
          </section>
        )}

        {/* ═══════════ SUBMITTED ═══════════ */}
        {phase === 'submitted' && (
          <section className="rounded-2xl border-2 border-green-400/30 bg-green-400/5 p-6 text-center space-y-4">
            <p className="text-4xl">✅</p>
            <h2 className="text-xl font-black text-green-300">Отправлено!</h2>
            {guessResult && (
              <div className={`rounded-xl px-4 py-2 text-sm font-bold ${
                guessResult.isCorrect ? 'text-green-300' : 'text-white/60'
              }`}>
                {guessResult.isCorrect
                  ? '🎉 Ты угадал! +50 баллов тебе и автору рисунка!'
                  : 'Не угадал, но ничего — продолжаем!'}
              </div>
            )}
            <p className="text-sm text-white/50">Ожидание остальных игроков…</p>
          </section>
        )}

        {/* ═══════════ VOTING ═══════════ */}
        {phase === 'voting' && (
          <section className="space-y-4">
            <div className="rounded-2xl border-2 border-yellow-400/30 bg-yellow-400/5 p-4 text-center">
              <h2 className="text-xl font-black text-yellow-300">🗳️ Голосование</h2>
              <p className="text-xs text-white/60 mt-1">
                Цепочка {(room.voting_chain_index || 0) + 1} — выбери лучший финальный рисунок
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {currentChainDrawings.map(({ step, chain, playerName, playerId }) => {
                const isMe = playerId === session.playerId;
                const isVoted = myVote === playerId;

                return (
                  <button
                    key={step.id}
                    onClick={() => !isMe && handleVote(playerId)}
                    disabled={isMe || votePending || !!myVote}
                    className={`rounded-2xl border-2 overflow-hidden transition-all active:scale-95 ${
                      isVoted ? 'border-yellow-400 shadow-lg shadow-yellow-400/20' :
                      isMe ? 'border-white/10 opacity-50' :
                      myVote ? 'border-white/10 opacity-60' :
                      'border-white/20 hover:border-purple-400/50'
                    }`}
                  >
                    <img src={step.drawing_data!} alt="" className="w-full aspect-square object-contain bg-white" />
                    <div className="px-2 py-2 text-center bg-black/40">
                      <span className="text-xs font-bold">{playerName}</span>
                      {step.target_word && (
                        <p className="text-[10px] text-purple-300 mt-0.5">«{step.target_word}»</p>
                      )}
                      {isVoted && <span className="ml-1 text-yellow-300">★</span>}
                      {isMe && <span className="ml-1 text-white/40">(ты)</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {myVote && (
              <p className="text-center text-green-300 text-sm font-bold">✅ Голос принят!</p>
            )}
          </section>
        )}

        {/* ═══════════ RESULTS ═══════════ */}
        {(phase === 'results' || phase === 'finished') && (
          <section className="space-y-4">
            <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-4 text-center">
              <p className="text-3xl mb-2">{phase === 'finished' ? '🏆' : '📊'}</p>
              <h2 className="text-xl font-black">
                {phase === 'finished' ? 'Игра окончена!' : `Результаты раунда ${room.current_round}`}
              </h2>
            </div>

            <div className="space-y-2">
              {sortedPlayers.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                    p.id === session.playerId ? 'border-purple-400/50 bg-purple-400/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                    </span>
                    <span className="font-bold text-sm">{p.name}</span>
                    {p.id === session.playerId && <span className="text-xs text-purple-300">(ты)</span>}
                  </div>
                  <span className="font-black text-purple-300">{p.score}</span>
                </div>
              ))}
            </div>

            {phase === 'results' && (
              <p className="text-center text-xs text-white/40">Ведущий переключит на следующий раунд…</p>
            )}

            {phase === 'finished' && (
              <div className="text-center pt-2">
                <Link
                  href="/"
                  className="px-6 py-3 rounded-xl border border-white/20 bg-white/10 text-sm font-bold hover:bg-white/20 transition inline-block"
                >
                  На главную
                </Link>
              </div>
            )}
          </section>
        )}

        {/* ═══════════ WAITING (generic) ═══════════ */}
        {phase === 'waiting' && room.status === 'playing' && (
          <section className="rounded-2xl border-2 border-white/10 bg-white/5 p-6 text-center space-y-3">
            <p className="text-3xl animate-pulse">⏳</p>
            <p className="text-sm text-white/60">Загрузка данных шага…</p>
          </section>
        )}
      </div>
    </div>
  );
}
