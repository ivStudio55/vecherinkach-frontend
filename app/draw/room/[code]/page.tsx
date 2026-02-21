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
import ComicBackground from '@/components/draw/ComicBackground';

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
  const roomPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  /* ── Poll room as fallback (realtime may lose events) ── */
  useEffect(() => {
    if (!room || room.status === 'finished') {
      if (roomPollRef.current) clearInterval(roomPollRef.current);
      return;
    }
    // Only poll when player is waiting for a state change they can't control
    if (phase !== 'submitted' && phase !== 'voting' && phase !== 'results') {
      if (roomPollRef.current) clearInterval(roomPollRef.current);
      return;
    }
    roomPollRef.current = setInterval(async () => {
      try {
        const r = await fetchDrawRoom(code);
        if (r.status !== room.status || r.current_step !== room.current_step || r.voting_chain_index !== room.voting_chain_index) {
          setRoom(r);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (roomPollRef.current) clearInterval(roomPollRef.current); };
  }, [phase, room?.status, room?.current_step, room?.voting_chain_index, code]);

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
      <ComicBackground>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white border-[4px] border-black px-8 py-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform -rotate-2">
            <p className="text-2xl font-bangers tracking-widest text-[#FF69B4]" style={{ WebkitTextStroke: '1px black' }}>
              {error || 'ЗАГРУЗКА…'}
            </p>
          </div>
        </div>
      </ComicBackground>
    );
  }

  return (
    <ComicBackground>
      <div className="min-h-screen text-black">
        <div className="max-w-md mx-auto px-4 py-6 space-y-6">
          {/* Mini header */}
          <header className="flex items-center justify-between bg-white border-[4px] border-black px-4 py-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
            <div className="text-sm">
              <span className="font-black uppercase tracking-widest">🎨 РИСУНКАЧ</span>
              {room.status === 'playing' && (
                <span className="ml-2 text-[#B266FF] font-bangers text-lg tracking-wide" style={{ WebkitTextStroke: '0.5px black' }}>
                  Р{room.current_round} · ШАГ {room.current_step}/{room.total_steps}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {room.status === 'playing' && (
                <span className={`text-2xl font-bangers tracking-widest ${timeLeft <= 10 ? 'text-[#FF69B4] animate-[pulse_0.5s_infinite]' : 'text-[#32CD32]'}`} style={{ WebkitTextStroke: '1px black' }}>
                  {timeLeft}С
                </span>
              )}
              <span className="text-lg font-bangers tracking-widest text-[#FFD700]" style={{ WebkitTextStroke: '1px black' }}>⭐ {myScore}</span>
            </div>
          </header>

          {error && (
            <div className="bg-[#FF69B4] border-[4px] border-black px-4 py-3 text-white text-lg font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
              {error}
            </div>
          )}

          {/* ═══════════ LOBBY ═══════════ */}
          {room.status === 'lobby' && (
            <section className="bg-white border-[6px] border-black p-8 text-center space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
              <p className="text-6xl drop-shadow-[2px_2px_0_#000] animate-[bounce_2s_infinite]">🎨</p>
              <h2 className="text-3xl font-bangers tracking-wide text-[#00BFFF] drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>ОЖИДАНИЕ НАЧАЛА ИГРЫ</h2>
              <div className="inline-block bg-[#FFD700] border-[3px] border-black px-4 py-2 transform rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <p className="text-lg font-black uppercase">КОД: <span className="text-2xl font-bangers tracking-widest text-white" style={{ WebkitTextStroke: '1px black' }}>{code}</span></p>
              </div>
              <div>
                <p className="text-sm font-black uppercase mb-3">ИГРОКИ ({gamePlayers.length})</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {gamePlayers.map(p => (
                    <span
                      key={p.id}
                      className={`border-[3px] border-black px-4 py-2 text-sm font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-1 transition-transform ${
                        p.id === session.playerId ? 'bg-[#B266FF] text-white -rotate-2' : 'bg-gray-100 rotate-1'
                      }`}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-sm font-bold bg-gray-100 border-[2px] border-black px-3 py-1 inline-block transform -rotate-1">ВЕДУЩИЙ СКОРО НАЧНЁТ ИГРУ…</p>
            </section>
          )}

          {/* ═══════════ FREE MODE: ENTER WORD ═══════════ */}
          {phase === 'free-word' && myStep && (
            <section className="space-y-6">
              <div className="inline-block bg-[#B266FF] border-[3px] border-black px-4 py-1 transform rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-sm font-black uppercase tracking-widest text-white">✏️ СВОБОДНЫЙ РЕЖИМ</span>
              </div>
              <div className="bg-white border-[6px] border-black p-8 text-center space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
                <p className="text-2xl font-bangers tracking-wide text-[#FF69B4]" style={{ WebkitTextStroke: '1px black' }}>ПРИДУМАЙ СЛОВО ДЛЯ РИСОВАНИЯ!</p>
                <input
                  className="w-full bg-white border-[4px] border-black px-4 py-4 text-2xl text-center font-bangers tracking-widest focus:outline-none focus:ring-4 focus:ring-[#00BFFF] shadow-[inset_4px_4px_0px_0px_rgba(0,0,0,0.1)]"
                  value={freeWord}
                  onChange={e => setFreeWord(e.target.value)}
                  placeholder="ВВЕДИ СЛОВО…"
                  autoFocus
                />
                <button
                  onClick={handleSubmitFreeWord}
                  disabled={!freeWord.trim()}
                  className="w-full bg-[#32CD32] hover:bg-[#28a428] text-white border-[4px] border-black font-bangers tracking-widest px-4 py-4 text-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform rotate-1"
                  style={{ WebkitTextStroke: '1px black' }}
                >
                  ДАЛЕЕ → РИСОВАТЬ
                </button>
              </div>
            </section>
          )}

          {/* ═══════════ DRAWING (Step 1) ═══════════ */}
          {phase === 'drawing' && myStep && (
            <section className="space-y-4">
              <div className="inline-block bg-[#B266FF] border-[3px] border-black px-4 py-1 transform -rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-sm font-black uppercase tracking-widest text-white">{roundLabel(room.current_round)}</span>
              </div>
              <div className="bg-white border-[6px] border-black p-2 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
                <DrawCanvas
                  maxStrokes={strokeLimit}
                  onSubmit={handleSubmitDrawing}
                  word={myStep.target_word || ''}
                />
              </div>
            </section>
          )}

          {/* ═══════════ GUESSING (Step 2+) ═══════════ */}
          {phase === 'guessing' && previousStep && (
            <section className="space-y-6">
              <div className="inline-block bg-[#B266FF] border-[3px] border-black px-4 py-1 transform rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-sm font-black uppercase tracking-widest text-white">{roundLabel(room.current_round)}</span>
              </div>

              <div className="text-center">
                <span className="text-xl font-bangers tracking-widest text-[#FF69B4] bg-white border-[3px] border-black px-4 py-2 inline-block transform -rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" style={{ WebkitTextStroke: '0.5px black' }}>ЧТО ЗДЕСЬ НАРИСОВАНО?</span>
              </div>

              {/* Previous drawing */}
              <div className="bg-white border-[6px] border-black overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
                {previousStep.drawing_data ? (
                  <img
                    src={previousStep.drawing_data}
                    alt="Рисунок для угадывания"
                    className="w-full aspect-square object-contain bg-white"
                  />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center bg-gray-100 text-gray-400 font-black uppercase">
                    ПУСТОЙ РИСУНОК
                  </div>
                )}
              </div>

            <div className="space-y-4">
              <input
                className="w-full bg-white border-[4px] border-black px-4 py-4 text-2xl text-center font-bangers tracking-widest focus:outline-none focus:ring-4 focus:ring-[#00BFFF] shadow-[inset_4px_4px_0px_0px_rgba(0,0,0,0.1)]"
                value={guess}
                onChange={e => setGuess(e.target.value)}
                placeholder="НАПИШИ СВОЮ ДОГАДКУ…"
                autoFocus
              />
              <button
                onClick={handleConfirmGuess}
                disabled={!guess.trim()}
                className="w-full bg-[#32CD32] hover:bg-[#28a428] text-white border-[4px] border-black font-bangers tracking-widest px-4 py-4 text-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform -rotate-1"
                style={{ WebkitTextStroke: '1px black' }}
              >
                ДАЛЕЕ → РИСОВАТЬ
              </button>
            </div>
          </section>
        )}

        {/* ═══════════ DRAWING GUESS (Step 2+ after guessing) ═══════════ */}
        {phase === 'drawing-guess' && (
          <section className="space-y-4">
            {guessResult && (
              <div className={`border-[4px] border-black px-4 py-3 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-1 ${
                guessResult.isCorrect ? 'bg-[#32CD32] text-white' : 'bg-[#FF69B4] text-white'
              }`}>
                <p className="text-xl font-bangers tracking-widest" style={{ WebkitTextStroke: '1px black' }}>
                  {guessResult.isCorrect ? '🎉 +50 БАЛЛОВ! ПРАВИЛЬНО!' : '❌ НЕ УГАДАЛ!'}
                </p>
              </div>
            )}
            <div className="bg-white border-[6px] border-black p-2 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
              <DrawCanvas
                maxStrokes={strokeLimit}
                onSubmit={handleSubmitGuessAndDrawing}
                word={guess}
              />
            </div>
          </section>
        )}

        {/* ═══════════ SUBMITTED ═══════════ */}
        {phase === 'submitted' && (
          <section className="bg-white border-[6px] border-black p-8 text-center space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
            <p className="text-6xl drop-shadow-[2px_2px_0_#000] animate-[bounce_2s_infinite]">✅</p>
            <h2 className="text-4xl font-bangers tracking-wide text-[#32CD32] drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>ОТПРАВЛЕНО!</h2>
            {guessResult && (
              <div className={`border-[3px] border-black px-4 py-3 transform -rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                guessResult.isCorrect ? 'bg-[#32CD32] text-white' : 'bg-gray-100 text-black'
              }`}>
                <p className="text-lg font-black uppercase">
                  {guessResult.isCorrect
                    ? '🎉 ТЫ УГАДАЛ! +50 БАЛЛОВ ТЕБЕ И АВТОРУ РИСУНКА!'
                    : 'НЕ УГАДАЛ, НО НИЧЕГО — ПРОДОЛЖАЕМ!'}
                </p>
              </div>
            )}
            <p className="text-sm font-bold bg-gray-100 border-[2px] border-black px-3 py-1 inline-block transform rotate-1">ОЖИДАНИЕ ОСТАЛЬНЫХ ИГРОКОВ…</p>
          </section>
        )}

        {/* ═══════════ VOTING ═══════════ */}
        {phase === 'voting' && (
          <section className="space-y-6">
            <div className="bg-[#FFD700] border-[6px] border-black p-6 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
              <h2 className="text-4xl font-bangers tracking-wide text-white drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>🗳️ ГОЛОСОВАНИЕ</h2>
              <div className="inline-block bg-white border-[3px] border-black px-4 py-1 mt-2 transform rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <p className="text-sm font-black uppercase">
                  ЦЕПОЧКА {(room.voting_chain_index || 0) + 1} — ВЫБЕРИ ЛУЧШИЙ РИСУНОК
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {currentChainDrawings.map(({ step, chain, playerName, playerId }, idx) => {
                const isMe = playerId === session.playerId;
                const isVoted = myVote === playerId;

                return (
                  <button
                    key={step.id}
                    onClick={() => !isMe && handleVote(playerId)}
                    disabled={isMe || votePending || !!myVote}
                    className={`bg-white border-[4px] border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all ${
                      isVoted ? 'ring-4 ring-[#FFD700] transform -translate-y-2' :
                      isMe ? 'opacity-50 grayscale' :
                      myVote ? 'opacity-60' :
                      'hover:-translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    }`}
                    style={{ animationDelay: `${idx * 300}ms` }}
                  >
                    <div className="relative border-b-[4px] border-black">
                      <img src={step.drawing_data!} alt="" className="w-full aspect-square object-contain bg-white" />
                      {isVoted && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <span className="text-6xl drop-shadow-[2px_2px_0_#000] animate-[bounce_1s_infinite]">⭐</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3 text-center bg-gray-50">
                      {step.target_word && (
                        <p className="text-xl font-bangers tracking-wide text-[#B266FF]" style={{ WebkitTextStroke: '0.5px black' }}>«{step.target_word}»</p>

                      )}
                      {isVoted && <span className="text-[#32CD32] font-black uppercase mt-1 block">★ ВЫБРАНО</span>}
                      {isMe && <span className="text-gray-400 font-black uppercase text-xs mt-1 block">(ТЫ)</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {myVote && (
              <div className="bg-[#32CD32] border-[4px] border-black px-4 py-3 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
                <p className="text-xl font-bangers tracking-widest text-white" style={{ WebkitTextStroke: '1px black' }}>✅ ГОЛОС ПРИНЯТ!</p>
              </div>
            )}
          </section>
        )}

        {/* ═══════════ RESULTS ═══════════ */}
        {(phase === 'results' || phase === 'finished') && (
          <section className="space-y-6">
            <div className="bg-white border-[6px] border-black p-6 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
              <p className="text-5xl mb-4 drop-shadow-[2px_2px_0_#000] animate-[bounce_2s_infinite]">{phase === 'finished' ? '🏆' : '📊'}</p>
              <h2 className="text-3xl font-bangers tracking-wide text-[#00BFFF] drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>
                {phase === 'finished' ? 'ИГРА ОКОНЧЕНА!' : `РЕЗУЛЬТАТЫ РАУНДА ${room.current_round}`}
              </h2>
              <a
                href="https://donatty.com/aleksandri"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block bg-[#FF69B4] hover:bg-[#ff4da6] text-white border-[3px] border-black px-4 py-2 font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all transform rotate-2"
              >
                💛 ПОДДЕРЖАТЬ ПРОЕКТ
              </a>
            </div>

            <div className="bg-white border-[6px] border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
              <div className="space-y-3">
                {sortedPlayers.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between border-[3px] border-black px-4 py-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                      p.id === session.playerId ? 'bg-[#B266FF] text-white transform -rotate-1' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl drop-shadow-[1px_1px_0_#000]">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="font-bangers text-black" style={{ WebkitTextStroke: '1px white' }}>{i + 1}.</span>}
                      </span>
                      <span className="font-black uppercase text-lg">{p.name}</span>
                      {p.id === session.playerId && <span className="text-xs font-black uppercase bg-white text-black px-1 border-[1px] border-black">(ТЫ)</span>}
                    </div>
                    <span className="text-2xl font-bangers tracking-widest text-[#FFD700] drop-shadow-[1px_1px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>{p.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {phase === 'results' && (
              <p className="text-center text-sm font-bold bg-white border-[3px] border-black px-4 py-2 inline-block transform -rotate-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">ВЕДУЩИЙ ПЕРЕКЛЮЧИТ НА СЛЕДУЮЩИЙ РАУНД…</p>
            )}

            {phase === 'finished' && (
              <div className="text-center pt-4">
                <Link
                  href="/"
                  className="inline-block bg-[#32CD32] hover:bg-[#28a428] text-white border-[4px] border-black font-bangers tracking-widest px-8 py-4 text-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all transform rotate-1"
                  style={{ WebkitTextStroke: '1px black' }}
                >
                  НА ГЛАВНУЮ
                </Link>
              </div>
            )}
          </section>
        )}

        {/* ═══════════ WAITING (generic) ═══════════ */}
        {phase === 'waiting' && room.status === 'playing' && (
          <section className="bg-white border-[6px] border-black p-8 text-center space-y-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
            <p className="text-5xl animate-[pulse_1s_infinite]">⏳</p>
            <p className="text-xl font-bangers tracking-widest text-[#B266FF]" style={{ WebkitTextStroke: '0.5px black' }}>ЗАГРУЗКА ДАННЫХ ШАГА…</p>
          </section>
        )}
      </div>
      {/* Bottom refresh panel shown after submission only (not during voting) */}
      {phase === 'submitted' && (
        <div className="fixed left-0 right-0 bottom-4 flex justify-center pointer-events-none">
          <div className="max-w-md w-full px-4 pointer-events-auto">
            <div className="bg-white border-[4px] border-black px-4 py-3 flex items-center justify-between gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
              <p className="text-sm font-black uppercase">ЕСЛИ ТЫ ВИДИШЬ НЕ ТО, ЧТО ВИДЯТ ДРУГИЕ ИГРОКИ — ОБНОВИ ЭКРАН</p>
              <button
                onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
                className="ml-2 bg-[#00BFFF] hover:bg-[#0099cc] text-white border-[3px] border-black font-black uppercase px-3 py-2 text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all transform -rotate-2"
              >
                ОБНОВИТЬ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ComicBackground>
  );
}
