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
  fetchVoteCountForChain,
  subscribeDrawRoom,
  subscribeDrawPlayers,
  subscribeDrawSteps,
  startRound,
  advanceStep,
  advanceVotingChain,
  finishVoting,
  nextRoundOrFinish,
  awardVotePoints,
  closeDrawRoom,
  drawStorage,
} from '@/lib/draw/api';
import type { DrawRoom, DrawPlayer, DrawChain, DrawStep } from '@/lib/draw/types';
import { roundLabel } from '@/lib/draw/types';
import ChainViewer from '@/components/draw/ChainViewer';
import { DrawAudioPlayer, AUDIO, getDrawCommentary } from '@/lib/draw/audio';

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

  // Pre-round countdown ("На старт, внимание, рисуем!")
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownLabels = ['', 'РИСУЕМ! 🎨', 'ВНИМАНИЕ...', 'НА СТАРТ...'];

  // Voting state
  const [chains, setChains] = useState<DrawChain[]>([]);
  const [allSteps, setAllSteps] = useState<DrawStep[]>([]);
  const [showingChain, setShowingChain] = useState(true);
  const [voteCount, setVoteCount] = useState(0);

  // Audio controls
  const [jingleMuted, setJingleMuted] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<DrawAudioPlayer>(new DrawAudioPlayer());
  const prevStatusRef = useRef<string>('');
  const prevSubmittedRef = useRef<number>(0);
  const commentaryPlayedRef = useRef<string>('');
  const advancingRef = useRef(false);
  const lastAdvancedStepRef = useRef<number>(0);

  /** Game players = non-host players */
  const gamePlayers = useMemo(() => players.filter(p => !p.is_host), [players]);
  const totalGamePlayers = gamePlayers.length;

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
      fetchDrawPlayers(room.id).then(p => {
        setPlayers(prev => {
          // Play duck sound on new player join
          if (p.length > prev.length) {
            audioRef.current.playSfx(AUDIO.duck());
          }
          return p;
        });
      }).catch(() => {});
    });
    const offSteps = subscribeDrawSteps(room.id, () => {
      if (room.status === 'playing') {
        checkSubmissions();
      }
    });
    return () => { offRoom(); offPlayers(); offSteps(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, room?.status]);

  /* ── Audio: react to status changes ── */
  useEffect(() => {
    if (!room) return;
    const audio = audioRef.current;
    const statusKey = `${room.status}-${room.current_round}-${room.current_step}`;
    if (statusKey === prevStatusRef.current) return;
    prevStatusRef.current = statusKey;

    if (room.status === 'lobby') {
      audio.playBgm(AUDIO.lobbyJingle);
      setTimeout(() => audio.playVoice(AUDIO.meetDraw()), 1500);
    } else if (room.status === 'playing') {
      audio.playBgm(AUDIO.drawTimer, false);
      const commentKey = `r${room.current_round}s${room.current_step}`;
      if (commentaryPlayedRef.current !== commentKey) {
        commentaryPlayedRef.current = commentKey;
        if (room.current_step === 1) {
          setTimeout(() => audio.playVoice(getDrawCommentary(room.current_round)), 2000);
        } else {
          setTimeout(() => audio.playVoice(AUDIO.guessDraw()), 2000);
        }
      }
    } else if (room.status === 'voting') {
      audio.playBgm(AUDIO.votingJingle);
      setTimeout(() => audio.playVoice(AUDIO.voteDraw()), 1500);
    } else if (room.status === 'results') {
      audio.stopBgm();
      audio.playBgm(AUDIO.afterRoundJingle, false);
      if (room.current_round >= 3) {
        setTimeout(() => audio.playVoice(AUDIO.finalDraw()), 3000);
      }
    } else if (room.status === 'finished') {
      audio.playBgm(AUDIO.afterRoundJingle, false);
      setTimeout(() => audio.playVoice(AUDIO.finalDraw()), 2000);
    }
  }, [room?.status, room?.current_round, room?.current_step]);

  /* ── Duck sound on drawing submission ── */
  useEffect(() => {
    if (submittedCount > prevSubmittedRef.current && prevSubmittedRef.current > 0) {
      audioRef.current.playSfx(AUDIO.duck());
    }
    prevSubmittedRef.current = submittedCount;
  }, [submittedCount]);

  /* ── Cleanup audio on unmount ── */
  useEffect(() => {
    return () => { audioRef.current.stopAll(); };
  }, []);

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
        if (room.status === 'finished') {
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
    if (!room || gamePlayers.length < 2) return;
    // Start countdown: 3 → 2 → 1 → go!
    setCountdown(3);
  };

  /* ── Countdown effect ── */
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      // Countdown finished — start the round
      setCountdown(null);
      (async () => {
        setPending(true);
        try {
          if (room!.status === 'lobby') {
            await startRound(room!.id, 1, players, room!.mode);
          } else {
            await nextRoundOrFinish(room!, players);
          }
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Ошибка');
        } finally {
          setPending(false);
        }
      })();
      return;
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

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
    const roundChainsArr = chains.filter(c => c.round === room.current_round);
    if (room.voting_chain_index >= roundChainsArr.length - 1) {
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
    if (room.current_round >= 3) {
      // Final round — go to finished directly
      setPending(true);
      try {
        await nextRoundOrFinish(room, players);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        setPending(false);
      }
    } else {
      // Next round — show countdown first
      setCountdown(3);
    }
  };

  const handleCloseRoom = async () => {
    if (!room) return;
    if (!confirm('Закрыть комнату? Это завершит игру для всех.')) return;
    try {
      await closeDrawRoom(room.id);
      audioRef.current.stopAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleToggleJingle = () => {
    const muted = audioRef.current.toggleJingleMute();
    setJingleMuted(muted);
  };

  const handleToggleVoice = () => {
    const muted = audioRef.current.toggleVoiceMute();
    setVoiceMuted(muted);
  };

  /* ── Derived ── */
  const sortedPlayers = useMemo(() => [...gamePlayers].sort((a, b) => b.score - a.score), [gamePlayers]);
  const roundChains = useMemo(
    () => chains.filter(c => c.round === (room?.current_round || 0)),
    [chains, room?.current_round],
  );
  const currentChain = roundChains[room?.voting_chain_index || 0] || null;
  const currentChainSteps = useMemo(
    () => currentChain ? allSteps.filter(s => s.chain_id === currentChain.id).sort((a, b) => a.step_number - b.step_number) : [],
    [currentChain, allSteps],
  );

  const modeLabel = room?.mode === 'english' ? '🇬🇧 English' : room?.mode === 'free' ? '✏️ Свободный' : '🇷🇺 Русский';

  /* ── Auto-advance when all submitted or timer expired ── */
  useEffect(() => {
    if (!room || room.status !== 'playing') {
      advancingRef.current = false;
      lastAdvancedStepRef.current = 0;
      return;
    }
    // Reset advancingRef when step changes (so auto-advance works on step 2+)
    if (room.current_step !== lastAdvancedStepRef.current) {
      advancingRef.current = false;
    }
    if (submittedCount >= totalGamePlayers && totalGamePlayers > 0) {
      if (advancingRef.current) return;
      advancingRef.current = true;
      lastAdvancedStepRef.current = room.current_step;
      advanceStep(room);
      return;
    }
    if (timeLeft <= 0 && totalGamePlayers > 0) {
      if (advancingRef.current) return;
      advancingRef.current = true;
      lastAdvancedStepRef.current = room.current_step;
      const t = setTimeout(() => advanceStep(room), 1000);
      return () => clearTimeout(t);
    }
  }, [submittedCount, totalGamePlayers, timeLeft, room]);

  /* ── Poll vote count during voting ── */
  useEffect(() => {
    if (!room || room.status !== 'voting' || !currentChain) {
      setVoteCount(0);
      return;
    }
    const checkVotes = async () => {
      try {
        const count = await fetchVoteCountForChain(currentChain.id);
        setVoteCount(count);
      } catch { /* ignore */ }
    };
    checkVotes();
    const interval = setInterval(checkVotes, 3000);
    return () => clearInterval(interval);
  }, [room?.status, room?.voting_chain_index, currentChain]);

  /* ── Auto-advance voting when all voted ── */
  useEffect(() => {
    if (!room || room.status !== 'voting') return;
    if (voteCount >= totalGamePlayers && totalGamePlayers > 0) {
      const t = setTimeout(() => handleNextChain(), 2000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voteCount, totalGamePlayers, room?.status]);

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
            <p className="text-xs text-white/40 mt-1">{modeLabel}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Audio controls */}
            <button
              onClick={handleToggleJingle}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition ${jingleMuted ? 'border-red-400/50 bg-red-400/10 text-red-300' : 'border-white/20 bg-white/10 text-white/80 hover:bg-white/20'}`}
              title={jingleMuted ? 'Включить музыку' : 'Выключить музыку'}
            >
              {jingleMuted ? '🔇 Музыка' : '🔊 Музыка'}
            </button>
            <button
              onClick={handleToggleVoice}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition ${voiceMuted ? 'border-red-400/50 bg-red-400/10 text-red-300' : 'border-white/20 bg-white/10 text-white/80 hover:bg-white/20'}`}
              title={voiceMuted ? 'Включить голос' : 'Выключить голос'}
            >
              {voiceMuted ? '🔇 Голос' : '🗣️ Голос'}
            </button>
            <button
              onClick={handleCloseRoom}
              className="px-3 py-2 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 text-xs font-bold hover:bg-red-500/20 transition"
              title="Закрыть комнату"
            >
              ✕ Закрыть
            </button>
            <div className="text-right ml-2">
              <p className="text-sm text-white/60">Статус</p>
              <p className="text-lg font-bold capitalize">{
                room.status === 'lobby' ? '⏳ Лобби' :
                room.status === 'playing' ? `🎮 Раунд ${room.current_round}` :
                room.status === 'voting' ? '🗳️ Голосование' :
                room.status === 'results' ? '📊 Результаты' :
                '🏆 Финал'
              }</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-400/30 px-4 py-3 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* ═══════════ COUNTDOWN OVERLAY ═══════════ */}
        {countdown !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="text-center animate-pulse">
              <p className="text-9xl font-black text-purple-300 drop-shadow-2xl">
                {countdown > 0 ? countdown : '🎨'}
              </p>
              <p className="text-4xl font-black mt-6 text-white">
                {countdownLabels[countdown] || 'РИСУЕМ! 🎨'}
              </p>
            </div>
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
                <p className="text-sm text-white/60 mb-3">Игроки ({gamePlayers.length})</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {gamePlayers.map(p => (
                    <div key={p.id} className="rounded-2xl border-2 border-white/20 bg-white/10 px-5 py-3 text-sm font-bold">
                      {p.name}
                    </div>
                  ))}
                  {gamePlayers.length === 0 && <p className="text-white/40">Пока никого…</p>}
                </div>
              </div>

              <button
                onClick={handleStartGame}
                disabled={pending || gamePlayers.length < 2}
                className="px-12 py-4 rounded-2xl bg-purple-600 text-white text-xl font-black tracking-[0.1em] hover:bg-purple-500 disabled:opacity-40 active:scale-95 transition"
              >
                {gamePlayers.length < 2 ? `Нужно минимум 2 игрока (сейчас ${gamePlayers.length})` : '🚀 Начать игру!'}
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
                <span className="text-lg font-bold text-purple-300">{submittedCount}/{totalGamePlayers}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {gamePlayers.map((p, i) => (
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
                  players={gamePlayers}
                  animated={showingChain}
                />
              </section>
            )}

            {/* Final drawings for voting */}
            <section className="rounded-3xl border-4 border-yellow-400/20 bg-yellow-400/5 p-6 text-center space-y-4">
              <h3 className="text-xl font-black text-yellow-300">🗳️ Игроки голосуют на своих телефонах!</h3>
              <p className="text-sm text-white/60">
                Каждый выбирает лучший рисунок этой цепочки
              </p>
              <p className="text-lg font-bold text-purple-300">
                Проголосовало: {voteCount} / {totalGamePlayers}
              </p>

              {/* Show all drawings from current chain with target words */}
              {currentChainSteps.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
                  {currentChainSteps.filter(s => s.drawing_data).map(step => {
                    const player = gamePlayers.find(p => p.id === step.player_id);
                    return (
                      <div key={step.id} className="rounded-xl border-2 border-white/20 bg-white/5 overflow-hidden">
                        <img src={step.drawing_data!} alt="" className="w-full aspect-square object-contain bg-white" />
                        <div className="px-2 py-2 text-center">
                          <p className="text-xs font-bold text-white/80">{player?.name || '???'}</p>
                          {step.target_word && (
                            <p className="text-xs text-purple-300 mt-0.5">«{step.target_word}»</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

            {/* Gallery of all drawings */}
            <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-6">
              <h3 className="text-xl font-black mb-4 text-center">🖼️ Галерея рисунков</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {allSteps
                  .filter(s => s.drawing_data)
                  .map(s => {
                    const player = gamePlayers.find(p => p.id === s.player_id);
                    return (
                      <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                        <img
                          src={s.drawing_data!}
                          alt={s.guess || 'drawing'}
                          className="w-full aspect-square object-contain rounded-lg bg-white"
                        />
                        <p className="text-xs text-white/60 text-center mt-1 truncate">
                          {player?.name || '?'}{s.guess ? `: ${s.guess}` : ''}
                        </p>
                      </div>
                    );
                  })}
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
