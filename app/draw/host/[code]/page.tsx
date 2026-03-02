"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { QRCodeCanvas } from 'qrcode.react';
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
import { DrawAudioPlayer, AUDIO, getDrawCommentary } from '@/lib/draw/audio';

import ComicBackground from '@/components/draw/ComicBackground';

export default function DrawHostPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code || '').toString().toUpperCase();

  const [room, setRoom] = useState<DrawRoom | null>(null);
  const [players, setPlayers] = useState<DrawPlayer[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // Playing state – track which step the count belongs to so stale values
  // from a previous step can never trigger auto-advance for the new step.
  const [submittedInfo, setSubmittedInfo] = useState<{count: number; step: number; round: number}>({count: 0, step: 0, round: 0});
  const submittedCount = submittedInfo.count; // convenience alias for display
  const [timeLeft, setTimeLeft] = useState(60);

  // Pre-round countdown ("На старт, внимание, рисуем!")
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownLabels = ['', 'РИСУЕМ! 🎨', 'ВНИМАНИЕ...', 'НА СТАРТ...'];

  // Voting state
  const [chains, setChains] = useState<DrawChain[]>([]);
  const [allSteps, setAllSteps] = useState<DrawStep[]>([]);
  const [voteCount, setVoteCount] = useState(0);

  // Audio controls
  const [jingleMuted, setJingleMuted] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [isAnimationsDisabled, setIsAnimationsDisabled] = useState(false);
  const [isJoinQrModalOpen, setIsJoinQrModalOpen] = useState(false);

  useEffect(() => {
    setJingleMuted(localStorage.getItem('draw_bgm_muted') === 'true');
    setVoiceMuted(localStorage.getItem('draw_voice_muted') === 'true');
    setIsAnimationsDisabled(localStorage.getItem('draw_animations_disabled') === 'true');
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<DrawAudioPlayer>(new DrawAudioPlayer());
  const prevStatusRef = useRef<string>('');
  const prevSubmittedRef = useRef<number>(0);
  const commentaryPlayedRef = useRef<string>('');
  const advancingRef = useRef(false);
  const lastAdvancedStepRef = useRef<number>(0);
  const checkSubmissionsRef = useRef<() => void>(() => {});

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
      // Use ref to always call the latest checkSubmissions (avoids stale closure)
      checkSubmissionsRef.current();
    });
    return () => { offRoom(); offPlayers(); offSteps(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

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
    if (submittedInfo.count > prevSubmittedRef.current && prevSubmittedRef.current > 0) {
      audioRef.current.playSfx(AUDIO.duck());
    }
    prevSubmittedRef.current = submittedInfo.count;
  }, [submittedInfo]);

  /* ── Cleanup audio on unmount ── */
  useEffect(() => {
    return () => { audioRef.current.stopAll(); };
  }, []);

  /* ── Poll submissions during playing ── */
  const checkSubmissions = useCallback(async () => {
    if (!room || room.status !== 'playing') return;
    try {
      const step = room.current_step;
      const round = room.current_round;
      const c = await fetchDrawChains(room.id, round);
      const ids = c.map(ch => ch.id);
      const count = await fetchSubmittedCount(ids, step);
      // Tag the count with the step/round it was fetched for.
      // If the room moved to a different step while the fetch was in-flight,
      // the auto-advance guard will harmlessly ignore this stale value.
      setSubmittedInfo({count, step, round});
    } catch { /* ignore */ }
  }, [room]);

  // Keep ref in sync so subscription always calls latest version
  useEffect(() => { checkSubmissionsRef.current = checkSubmissions; }, [checkSubmissions]);

  // Reset submitted count when step changes (for display; auto-advance guard is the real protection)
  useEffect(() => {
    setSubmittedInfo({count: 0, step: room?.current_step || 0, round: room?.current_round || 0});
  }, [room?.current_step, room?.current_round]);

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
    // CRITICAL GUARD: only auto-advance if the count was fetched for THIS exact step/round.
    // Without this, a stale count from step N causes an immediate double-advance into voting.
    const countIsCurrent = submittedInfo.step === room.current_step
      && submittedInfo.round === room.current_round;

    if (countIsCurrent && submittedInfo.count >= totalGamePlayers && totalGamePlayers > 0) {
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
  }, [submittedInfo, totalGamePlayers, timeLeft, room]);

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
      <ComicBackground>
        <div className="flex items-center justify-center">
          <div className="bg-white border-[4px] border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-2">
            <p className="text-3xl font-bangers tracking-widest text-[#FF69B4]" style={{ WebkitTextStroke: '1px black' }}>
              {error || 'ЗАГРУЗКА...'}
            </p>
          </div>
        </div>
      </ComicBackground>
    );
  }

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/draw?code=${code}` : '';

  return (
    <div className={isAnimationsDisabled ? 'disable-animations' : ''}>
      <ComicBackground>
        <div className="max-w-6xl mx-auto space-y-8 text-black">
          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-4 bg-white border-[6px] border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
            <div>
            <div className="inline-block bg-[#FF69B4] border-[3px] border-black px-3 py-1 transform rotate-2 mb-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <p className="uppercase text-xs font-black tracking-widest text-white">🎨 Рисункач</p>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bangers tracking-wide text-[#00BFFF] drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>
              КОМНАТА: {code}
            </h1>
            <p className="text-sm font-bold mt-2 bg-gray-100 border-[2px] border-black px-2 py-1 inline-block">{modeLabel}</p>
            <a
              href="https://donatty.com/aleksandri"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 ml-3 inline-block bg-[#FFD700] border-[3px] border-black px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] transition-all"
            >
              💛 Поддержать
            </a>
          </div>
          <div className="flex items-center gap-4">
            {/* Audio controls */}
            <button
              onClick={handleToggleJingle}
              className={`w-12 h-12 rounded-full border-[4px] border-black flex items-center justify-center text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:scale-110 ${jingleMuted ? 'bg-gray-300' : 'bg-[#FFD700]'}`}
              title={jingleMuted ? 'Включить музыку' : 'Выключить музыку'}
            >
              {jingleMuted ? '🔇' : '🎵'}
            </button>
            <button
              onClick={handleToggleVoice}
              className={`w-12 h-12 rounded-full border-[4px] border-black flex items-center justify-center text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:scale-110 ${voiceMuted ? 'bg-gray-300' : 'bg-[#B266FF]'}`}
              title={voiceMuted ? 'Включить голос' : 'Выключить голос'}
            >
              {voiceMuted ? '🤫' : '🗣️'}
            </button>
            <button
              onClick={() => {
                const next = !isAnimationsDisabled;
                setIsAnimationsDisabled(next);
                localStorage.setItem('draw_animations_disabled', String(next));
              }}
              className={`w-12 h-12 rounded-full border-[4px] border-black flex items-center justify-center text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:scale-110 ${isAnimationsDisabled ? 'bg-gray-300' : 'bg-[#FF69B4]'}`}
              title={isAnimationsDisabled ? 'Включить анимации' : 'Выключить анимации'}
            >
              ✨
            </button>
            <button
              onClick={() => setIsJoinQrModalOpen(true)}
              className="bg-[#00BFFF] hover:bg-[#00a6df] text-white border-[4px] border-black px-4 py-2 font-black uppercase text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] transition-all"
              title="QR для подключения"
            >
              QR
            </button>
            <button
              onClick={handleCloseRoom}
              className="bg-red-500 hover:bg-red-600 text-white border-[4px] border-black px-4 py-2 font-black uppercase text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] transition-all"
              title="Закрыть комнату"
            >
              ✕ Закрыть
            </button>
            <div className="text-right ml-4 bg-gray-100 border-[3px] border-black p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transform rotate-2">
              <p className="text-xs font-black uppercase">Статус</p>
              <p className="text-xl font-bangers tracking-widest text-[#FF69B4]" style={{ WebkitTextStroke: '0.5px black' }}>{
                room.status === 'lobby' ? '⏳ ЛОББИ' :
                room.status === 'playing' ? `🎮 РАУНД ${room.current_round}` :
                room.status === 'voting' ? '🗳️ ГОЛОСОВАНИЕ' :
                room.status === 'results' ? '📊 РЕЗУЛЬТАТЫ' :
                '🏆 ФИНАЛ'
              }</p>
            </div>
          </div>
        </header>

        {isJoinQrModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
            <div className="w-full max-w-xl bg-white border-[6px] border-black p-6 text-center space-y-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bangers tracking-wide text-[#FF69B4]" style={{ WebkitTextStroke: '1px black' }}>
                  QR для подключения
                </h2>
                <button
                  onClick={() => setIsJoinQrModalOpen(false)}
                  className="bg-white border-[4px] border-black px-3 py-1 font-black text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                >
                  ✕
                </button>
              </div>
              <div className="bg-white rounded-2xl p-4 inline-block border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <QRCodeCanvas value={joinUrl} size={240} fgColor="#000000" bgColor="#ffffff" />
              </div>
              <p className="text-5xl font-bangers tracking-widest text-[#00BFFF]" style={{ WebkitTextStroke: '1px black' }}>{code}</p>
              <p className="text-xs text-gray-600 font-bold break-all">{joinUrl}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-white border-[4px] border-black p-4 transform rotate-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-red-600 font-black uppercase text-center">{error}</p>
          </div>
        )}

        {/* ═══════════ COUNTDOWN OVERLAY ═══════════ */}
        {countdown !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="text-center animate-[pulse_1s_ease-in-out_infinite]">
              <p className="text-9xl font-bangers text-[#FFD700] drop-shadow-[4px_4px_0_#000]" style={{ WebkitTextStroke: '3px black' }}>
                {countdown > 0 ? countdown : '🎨'}
              </p>
              <p className="text-6xl font-bangers mt-6 text-white drop-shadow-[3px_3px_0_#000]" style={{ WebkitTextStroke: '2px black' }}>
                {countdownLabels[countdown] || 'РИСУЕМ! 🎨'}
              </p>
            </div>
          </div>
        )}

        {/* ═══════════ LOBBY ═══════════ */}
        {room.status === 'lobby' && (() => {
          return (
          <div className="space-y-8">
            <section className="bg-white border-[6px] border-black p-10 text-center space-y-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
              <div>
                <div className="inline-block bg-[#00BFFF] border-[3px] border-black px-4 py-1 transform -rotate-2 mb-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <p className="text-sm font-black uppercase tracking-widest text-white">Код для подключения</p>
                </div>
                <p className="text-8xl sm:text-9xl font-bangers tracking-widest text-[#FF69B4] drop-shadow-[4px_4px_0_#000]" style={{ WebkitTextStroke: '2px black' }}>{code}</p>
                <div className="bg-white rounded-2xl p-4 inline-block border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mt-4">
                  <QRCodeCanvas value={joinUrl} size={220} fgColor="#000000" bgColor="#ffffff" />
                </div>
                <p className="mt-2 text-xs text-gray-500 font-bold break-all">{joinUrl}</p>
                <p className="mt-4 text-lg font-bold bg-gray-100 border-[2px] border-black px-4 py-2 inline-block transform rotate-1">Игроки вводят этот код или сканируют QR</p>
              </div>

              <div className="bg-gray-50 border-[4px] border-black p-6 shadow-[inset_4px_4px_0px_0px_rgba(0,0,0,0.1)]">
                <p className="text-xl font-bangers tracking-wide mb-4 text-[#B266FF]" style={{ WebkitTextStroke: '1px black' }}>ИГРОКИ ({gamePlayers.length})</p>
                <div className="flex flex-wrap justify-center gap-4">
                  {gamePlayers.map(p => (
                    <div key={p.id} className="bg-white border-[3px] border-black px-6 py-3 text-xl font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-1 transition-transform">
                      {p.name}
                    </div>
                  ))}
                  {gamePlayers.length === 0 && <p className="text-gray-500 font-bold text-lg">Пока никого...</p>}
                </div>
              </div>

              <button
                onClick={handleStartGame}
                disabled={pending || gamePlayers.length < 2}
                className="px-12 py-6 bg-[#FFD700] hover:bg-[#FFC000] text-black border-[6px] border-black text-3xl font-bangers tracking-widest shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform -rotate-1"
              >
                {gamePlayers.length < 2 ? `НУЖНО МИНИМУМ 2 ИГРОКА (СЕЙЧАС ${gamePlayers.length})` : '🚀 НАЧАТЬ ИГРУ!'}
              </button>
            </section>
          </div>
          );
        })()}

        {/* ═══════════ PLAYING ═══════════ */}
        {room.status === 'playing' && (
          <div className="space-y-8">
            {/* Round info */}
            <section className="bg-white border-[6px] border-black p-8 text-center space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
              <div className="flex flex-wrap items-center justify-center gap-8 text-xl">
                <div className="bg-gray-100 border-[3px] border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-2">
                  <span className="text-sm font-black uppercase block mb-1">Раунд</span>
                  <p className="text-5xl font-bangers text-[#FF69B4]" style={{ WebkitTextStroke: '1px black' }}>{room.current_round}</p>
                </div>
                <div className="bg-gray-100 border-[3px] border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform -rotate-2">
                  <span className="text-sm font-black uppercase block mb-1">Шаг</span>
                  <p className="text-5xl font-bangers text-[#00BFFF]" style={{ WebkitTextStroke: '1px black' }}>{room.current_step} / {room.total_steps}</p>
                </div>
                <div className={`border-[4px] border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-1 ${timeLeft <= 10 ? 'bg-red-500 animate-[pulse_0.5s_ease-in-out_infinite]' : 'bg-[#32CD32]'}`}>
                  <span className="text-sm font-black uppercase text-white block mb-1">Таймер</span>
                  <p className="text-6xl font-bangers text-white drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '2px black' }}>
                    {timeLeft}с
                  </p>
                </div>
              </div>

              <div className="inline-block bg-[#B266FF] border-[3px] border-black px-6 py-2 transform rotate-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-lg font-black text-white uppercase tracking-wider">{roundLabel(room.current_round)}</span>
              </div>

              <p className="text-xl font-bold bg-gray-100 border-[2px] border-black px-4 py-2 inline-block transform -rotate-1">
                {room.current_step === 1
                  ? 'Игроки получили слова и рисуют...'
                  : 'Игроки угадывают и рисуют...'}
              </p>
            </section>

            {/* Submission status */}
            <section className="bg-white border-[6px] border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
              <div className="flex items-center justify-between mb-6 border-b-[4px] border-black pb-4">
                <h2 className="text-3xl font-bangers tracking-wide text-[#FF69B4]" style={{ WebkitTextStroke: '1px black' }}>СТАТУС ИГРОКОВ</h2>
                <div className="bg-[#FFD700] border-[3px] border-black px-4 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transform -rotate-2">
                  <span className="text-2xl font-bangers">{submittedCount}/{totalGamePlayers}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {gamePlayers.map((p, i) => (
                  <div
                    key={p.id}
                    className={`border-[3px] border-black px-4 py-3 text-center text-lg font-bold transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                      i < submittedCount ? 'bg-[#32CD32] text-white transform -translate-y-1' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {i < submittedCount ? '✅ ' : '⏳ '}{p.name}
                  </div>
                ))}
              </div>

              <div className="mt-8 text-center">
                <button
                  onClick={handleAdvanceStep}
                  disabled={pending}
                  className="bg-white border-[4px] border-black px-6 py-3 text-lg font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50"
                >
                  Пропустить таймер →
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ═══════════ VOTING ═══════════ */}
        {room.status === 'voting' && (
          <div className="space-y-8">
            <section className="bg-white border-[6px] border-black p-8 text-center space-y-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
              <div className="inline-block bg-[#00BFFF] border-[3px] border-black px-4 py-1 transform -rotate-2 mb-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <p className="text-sm font-black uppercase tracking-widest text-white">Голосование после раунда {room.current_round}</p>
              </div>
              <h2 className="text-5xl font-bangers tracking-wide text-[#FF69B4] drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>
                ЦЕПОЧКА {(room.voting_chain_index || 0) + 1} ИЗ {roundChains.length}
              </h2>
              <p className="text-xl font-bold bg-gray-100 border-[2px] border-black px-4 py-2 inline-block transform rotate-1">Смотрим как менялся рисунок от слова к слову</p>
            </section>

            {/* Drawings for voting with sequential animation */}
            <section className="bg-[#FFD700] border-[6px] border-black p-8 text-center space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
              <h3 className="text-3xl font-bangers tracking-wide text-white drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>🗳️ ИГРОКИ ГОЛОСУЮТ НА СВОИХ ТЕЛЕФОНАХ!</h3>
              <p className="text-lg font-bold bg-white border-[3px] border-black px-4 py-2 inline-block transform rotate-1">
                Каждый выбирает лучший рисунок этой цепочки
              </p>
              <div className="bg-white border-[4px] border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform -rotate-2 inline-block mx-auto">
                <p className="text-2xl font-bangers tracking-widest text-[#B266FF]" style={{ WebkitTextStroke: '1px black' }}>
                  ПРОГОЛОСОВАЛО: {voteCount} / {totalGamePlayers}
                </p>
              </div>

              {/* Show all drawings from current chain with sequential reveal */}
              {currentChainSteps.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 mt-8">
                  {currentChainSteps.filter(s => s.drawing_data).map((step, idx) => {
                    const player = gamePlayers.find(p => p.id === step.player_id);
                    return (
                      <div
                        key={step.id}
                        className="bg-white border-[4px] border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-2 transition-transform"
                        style={{ animationDelay: `${idx * 400 + 300}ms` }}
                      >
                        <div className="relative border-b-[4px] border-black">
                          <img src={step.drawing_data!} alt="" className="w-full aspect-square object-contain bg-white" />
                          <span className="absolute top-2 left-2 w-10 h-10 rounded-full bg-[#FF69B4] border-[3px] border-black text-white text-xl font-bangers flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transform -rotate-12">{idx + 1}</span>
                        </div>
                        <div className="p-4 text-center bg-gray-50">
                          <p className="text-lg font-black uppercase">{player?.name || '???'}</p>
                          {step.target_word && (
                            <p className="text-xl font-bangers tracking-wide text-[#00BFFF] mt-1" style={{ WebkitTextStroke: '0.5px black' }}>«{step.target_word}»</p>
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
                className="px-10 py-4 bg-[#B266FF] hover:bg-[#9932CC] text-white border-[6px] border-black text-2xl font-bangers tracking-widest shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform rotate-1"
                style={{ WebkitTextStroke: '1px black' }}
              >
                {(room.voting_chain_index || 0) >= roundChains.length - 1
                  ? '📊 ПОКАЗАТЬ РЕЗУЛЬТАТЫ'
                  : `СЛЕДУЮЩАЯ ЦЕПОЧКА →`}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════ RESULTS ═══════════ */}
        {room.status === 'results' && (
          <div className="space-y-8">
            <section className="bg-white border-[6px] border-black p-8 text-center space-y-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
              <div className="inline-block bg-[#00BFFF] border-[3px] border-black px-4 py-1 transform rotate-2 mb-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <p className="text-sm font-black uppercase tracking-widest text-white">Результаты раунда {room.current_round}</p>
              </div>
              <h2 className="text-5xl font-bangers tracking-wide text-[#FF69B4] drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>📊 ТАБЛИЦА ЛИДЕРОВ</h2>
            </section>

            <section className="bg-white border-[6px] border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
              <div className="space-y-4">
                {sortedPlayers.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between border-[4px] border-black px-6 py-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-1 transition-transform ${
                      i === 0 ? 'bg-[#FFD700]' :
                      i === 1 ? 'bg-gray-200' :
                      i === 2 ? 'bg-[#CD7F32]' :
                      'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-4xl drop-shadow-[2px_2px_0_#000]">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="font-bangers text-black" style={{ WebkitTextStroke: '1px white' }}>{i + 1}.</span>}
                      </span>
                      <span className="text-2xl font-black uppercase">{p.name}</span>
                    </div>
                    <span className="text-4xl font-bangers text-[#00BFFF] drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>{p.score}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="text-center">
              <button
                onClick={handleNextRound}
                disabled={pending}
                className="px-10 py-4 bg-[#32CD32] hover:bg-[#28a428] text-white border-[6px] border-black text-2xl font-bangers tracking-widest shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform -rotate-1"
                style={{ WebkitTextStroke: '1px black' }}
              >
                {room.current_round >= 3
                  ? '🏆 ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ'
                  : `🚀 НАЧАТЬ РАУНД ${room.current_round + 1}`}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════ FINISHED ═══════════ */}
        {room.status === 'finished' && (
          <div className="space-y-8">
            <section className="bg-[#FFD700] border-[6px] border-black p-8 text-center space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
              <p className="text-7xl drop-shadow-[4px_4px_0_#000] animate-[bounce_2s_infinite]">🏆</p>
              <h2 className="text-6xl font-bangers tracking-wide text-white drop-shadow-[3px_3px_0_#000]" style={{ WebkitTextStroke: '2px black' }}>ИГРА ОКОНЧЕНА!</h2>
              {sortedPlayers[0] && (
                <div className="inline-block bg-white border-[4px] border-black px-6 py-3 transform -rotate-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <p className="text-3xl font-bangers tracking-widest text-[#FF69B4]" style={{ WebkitTextStroke: '1px black' }}>
                    ПОБЕДИТЕЛЬ: {sortedPlayers[0].name} — {sortedPlayers[0].score} БАЛЛОВ!
                  </p>
                </div>
              )}
            </section>

            <section className="bg-white border-[6px] border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
              <div className="inline-block bg-[#B266FF] border-[3px] border-black px-4 py-1 transform rotate-2 mb-6 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-xl font-black uppercase tracking-widest text-white">Финальная таблица</h3>
              </div>
              <div className="space-y-4">
                {sortedPlayers.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between border-[4px] border-black px-6 py-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-1 transition-transform ${
                      i === 0 ? 'bg-[#FFD700]' :
                      i === 1 ? 'bg-gray-200' :
                      i === 2 ? 'bg-[#CD7F32]' :
                      'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-4xl drop-shadow-[2px_2px_0_#000]">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="font-bangers text-black" style={{ WebkitTextStroke: '1px white' }}>{i + 1}.</span>}
                      </span>
                      <span className="text-2xl font-black uppercase">{p.name}</span>
                    </div>
                    <span className="text-4xl font-bangers text-[#00BFFF] drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>{p.score}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Gallery of all drawings */}
            <section className="bg-[#00BFFF] border-[6px] border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
              <div className="text-center mb-8">
                <div className="inline-block bg-white border-[4px] border-black px-6 py-2 transform -rotate-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <h3 className="text-3xl font-bangers tracking-widest text-[#FF69B4]" style={{ WebkitTextStroke: '1px black' }}>🖼️ ГАЛЕРЕЯ РИСУНКОВ</h3>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {allSteps
                  .filter(s => s.drawing_data)
                  .map((s, idx) => {
                    const player = gamePlayers.find(p => p.id === s.player_id);
                    return (
                      <div key={s.id} className="bg-white border-[4px] border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-2 transition-transform" style={{animationDelay: `${idx * 100 + 500}ms`}}>
                        <div className="relative border-b-[4px] border-black">
                          <img
                            src={s.drawing_data!}
                            alt={s.guess || s.target_word || 'drawing'}
                            className="w-full aspect-square object-contain bg-white"
                          />
                        </div>
                        <div className="p-4 text-center bg-gray-50">
                          <p className="text-xl font-bangers tracking-wide text-[#B266FF]" style={{ WebkitTextStroke: '0.5px black' }}>
                            {s.target_word ? `«${s.target_word}»` : (s.guess ? `«${s.guess}»` : '')}
                          </p>
                          <p className="text-lg font-black uppercase mt-1">
                            🎨 {player?.name || '?'}
                          </p>
                        </div>
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
      </ComicBackground>
    </div>
  );
}
