// app/creativach/host/[code]/page.tsx
// Экран ведущего «Креативач»
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  fetchCreativachRoom,
  fetchCreativachPlayers,
  fetchCreativachAnswers,
  fetchCreativachVotes,
  updateCreativachRoom,
  updatePlayerPoints,
  resetAllPoints,
  subscribeCreativachRoom,
  subscribeCreativachPlayers,
  subscribeCreativachAnswers,
  subscribeCreativachVotes,
  creativachStorage,
} from '@/lib/creativach/api';
import type {
  CreativachRoom,
  CreativachPlayer,
  CreativachAnswer,
  CreativachVote,
} from '@/lib/creativach/types';
import {
  ROUNDS,
  POINTS,
  MIN_PLAYERS,
  ANSWER_TIME_SEC,
  VOTE_TIME_SEC,
  TOTAL_ROUNDS,
  generateAbbreviation,
} from '@/lib/creativach/types';
import { CreativachAudioPlayer, CREATIVACH_AUDIO } from '@/lib/creativach/audio';

/* ─── Timer Circle ─── */
function TimerCircle({ seconds, total, label }: { seconds: number; total: number; label?: string }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const progress = total > 0 ? seconds / total : 0;
  const offset = circ * (1 - progress);
  const color = seconds <= 10 ? '#ef4444' : seconds <= 20 ? '#f59e0b' : '#22c55e';

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#333" strokeWidth="8" opacity={0.3} />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-white drop-shadow-[2px_2px_0_#000]">{seconds}</span>
        {label && <span className="text-xs text-gray-300 font-bold mt-1">{label}</span>}
      </div>
    </div>
  );
}

/* ─── Confetti particles ─── */
function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#FF6B35', '#FFD700', '#FF1493', '#00CED1', '#7FFF00', '#FF4500', '#9400D3'];
    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      color: string; size: number; rotation: number; rotSpeed: number;
    }> = [];

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: -(Math.random() * 8 + 4),
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
      });
    }

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.rotation += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.4);
        ctx.restore();
      }
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50" />;
}

export default function CreativachHostPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string) || '';

  const [room, setRoom] = useState<CreativachRoom | null>(null);
  const [players, setPlayers] = useState<CreativachPlayer[]>([]);
  const [answers, setAnswers] = useState<CreativachAnswer[]>([]);
  const [votes, setVotes] = useState<CreativachVote[]>([]);
  const [timerSec, setTimerSec] = useState(0);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [resultsRevealed, setResultsRevealed] = useState(false);
  const [excuses, setExcuses] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [themes, setThemes] = useState<string[]>([]);

  const audioRef = useRef<CreativachAudioPlayer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const motivationPlayedRef = useRef(false);

  // Audio init
  useEffect(() => {
    audioRef.current = new CreativachAudioPlayer();
    return () => { audioRef.current?.destroy(); };
  }, []);

  // Load question data
  useEffect(() => {
    Promise.all([
      fetch('/questions/excuses.json').then(r => r.json()),
      fetch('/questions/brands.json').then(r => r.json()),
      fetch('/questions/themes.json').then(r => r.json()),
    ]).then(([e, b, t]) => {
      setExcuses(e);
      setBrands(b);
      setThemes(t);
    });
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!code) return;
    (async () => {
      const r = await fetchCreativachRoom(code);
      if (!r) return;
      setRoom(r);
      const p = await fetchCreativachPlayers(r.id);
      setPlayers(p);
      if (r.current_round > 0) {
        const a = await fetchCreativachAnswers(r.id, r.current_round);
        setAnswers(a);
        const v = await fetchCreativachVotes(r.id, r.current_round);
        setVotes(v);
      }
    })();
  }, [code]);

  // Realtime subscriptions
  useEffect(() => {
    if (!room?.id) return;
    const unsubs = [
      subscribeCreativachRoom(room.id, r => setRoom(r)),
      subscribeCreativachPlayers(room.id, p => setPlayers(p)),
    ];
    return () => unsubs.forEach(u => u());
  }, [room?.id]);

  // Reset answers/votes immediately when round changes to avoid stale data triggering auto-skip
  useEffect(() => {
    if (!room?.current_round) return;
    setAnswers([]);
    setVotes([]);
  }, [room?.current_round]);

  // Subscribe to answers and votes for current round
  useEffect(() => {
    if (!room?.id || !room.current_round) return;
    const unsubs = [
      subscribeCreativachAnswers(room.id, room.current_round, a => setAnswers(a)),
      subscribeCreativachVotes(room.id, room.current_round, v => setVotes(v)),
    ];
    return () => unsubs.forEach(u => u());
  }, [room?.id, room?.current_round]);

  // Play lobby music
  useEffect(() => {
    if (room?.status === 'lobby') {
      audioRef.current?.playBgm(CREATIVACH_AUDIO.lobbyMusic);
      audioRef.current?.playVoiceRandom(CREATIVACH_AUDIO.greetingsFolder);
    }
  }, [room?.status]);

  // Play duck sound on new player connect
  const prevPlayerCountRef = useRef(0);
  useEffect(() => {
    const playerCount = players.filter(p => !p.is_host).length;
    if (playerCount > prevPlayerCountRef.current && room?.status === 'lobby') {
      audioRef.current?.playRandomDuck();
    }
    prevPlayerCountRef.current = playerCount;
  }, [players, room?.status]);

  // Timer logic
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!room?.timer_started_at || !room.timer_duration_sec) return;

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - new Date(room.timer_started_at!).getTime()) / 1000);
      const remaining = Math.max(0, room.timer_duration_sec - elapsed);
      setTimerSec(remaining);

      // Play motivation voice at start and at 30 seconds
      if (room.voting_phase === 'answering') {
        if (remaining === room.timer_duration_sec - 2 && !motivationPlayedRef.current) {
          motivationPlayedRef.current = true;
          audioRef.current?.playVoiceRandom(CREATIVACH_AUDIO.motivationFolder);
        }
        if (remaining === 30) {
          audioRef.current?.playVoiceRandom(CREATIVACH_AUDIO.motivationFolder);
        }
      }

      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        handleTimerEnd();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.timer_started_at, room?.timer_duration_sec, room?.voting_phase]);

  // Derived
  const gamePlayers = useMemo(() => players.filter(p => p.role === 'player' && !p.is_host), [players]);
  const spectators = useMemo(() => players.filter(p => p.role === 'spectator'), [players]);
  const canStart = gamePlayers.length >= MIN_PLAYERS;
  const currentRoundInfo = room?.current_round ? ROUNDS[room.current_round - 1] : null;

  const sortedByPoints = useMemo(() =>
    [...gamePlayers].sort((a, b) => b.total_points - a.total_points),
    [gamePlayers],
  );

  // Get vote results for current round
  const voteResults = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of votes) {
      map.set(v.voted_for_id, (map.get(v.voted_for_id) || 0) + 1);
    }
    return map;
  }, [votes]);

  // Answers with vote counts, sorted by votes
  const answersWithVotes = useMemo(() => {
    return answers.map(a => ({
      ...a,
      voteCount: voteResults.get(a.player_id) || 0,
      player: gamePlayers.find(p => p.id === a.player_id),
    })).sort((a, b) => b.voteCount - a.voteCount);
  }, [answers, voteResults, gamePlayers]);

  /* ══════════════════════════════════════════════
     Game flow handlers
     ══════════════════════════════════════════════ */

  const handleTimerEnd = useCallback(async () => {
    if (!room) return;
    if (room.voting_phase === 'answering') {
      // Переход к голосованию
      await updateCreativachRoom(room.id, {
        voting_phase: 'voting',
        timer_started_at: new Date().toISOString(),
        timer_duration_sec: VOTE_TIME_SEC,
      });
      audioRef.current?.stopBgm();
      audioRef.current?.playBgm(CREATIVACH_AUDIO.timer30Music, 0.3, false);
      audioRef.current?.playVoiceRandom(CREATIVACH_AUDIO.votingFolder);
    } else if (room.voting_phase === 'voting') {
      // Подведение итогов
      await calculateAndShowResults();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const calculateAndShowResults = useCallback(async () => {
    if (!room) return;
    const roundVotes = await fetchCreativachVotes(room.id, room.current_round);
    const roundAnswers = await fetchCreativachAnswers(room.id, room.current_round);

    // Count votes per player
    const voteCounts = new Map<string, number>();
    for (const v of roundVotes) {
      voteCounts.set(v.voted_for_id, (voteCounts.get(v.voted_for_id) || 0) + 1);
    }

    // Find max votes
    let maxVotes = 0;
    for (const count of voteCounts.values()) {
      if (count > maxVotes) maxVotes = count;
    }

    const isFinal = room.current_round === 5;
    const votePoints = isFinal ? POINTS.FINAL_VOTE : POINTS.VOTE;
    const bonusPoints = isFinal ? POINTS.FINAL_WINNER_BONUS : POINTS.WINNER_BONUS;

    // Award points
    for (const answer of roundAnswers) {
      const playerVoteCount = voteCounts.get(answer.player_id) || 0;
      let points = playerVoteCount * votePoints;
      if (playerVoteCount > 0 && playerVoteCount === maxVotes) {
        points += bonusPoints;
      }
      if (points > 0) {
        await updatePlayerPoints(answer.player_id, points);
      }
    }

    // Show results
    const isFinished = room.current_round >= TOTAL_ROUNDS;
    await updateCreativachRoom(room.id, {
      voting_phase: 'results',
      status: isFinished ? 'final_results' : 'round_results',
      timer_started_at: null,
      timer_duration_sec: 0,
    });

    audioRef.current?.stopBgm();
    if (isFinished) {
      audioRef.current?.playBgm(CREATIVACH_AUDIO.finalMusic, 0.5, false);
      audioRef.current?.playVoiceRandom(CREATIVACH_AUDIO.congratulationsFolder);
      setShowConfetti(true);
    } else {
      audioRef.current?.playBgm(CREATIVACH_AUDIO.betweenMusic, 0.3, false);
      audioRef.current?.playVoiceRandom(CREATIVACH_AUDIO.resultsFolder);
    }
    setResultsRevealed(true);
  }, [room]);

  const startGame = useCallback(async () => {
    if (!room) return;
    audioRef.current?.stopBgm();
    audioRef.current?.playBgm(CREATIVACH_AUDIO.betweenMusic, 0.3, false);
    await startRound(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const startRound = useCallback(async (roundNum: number) => {
    if (!room) return;
    setResultsRevealed(false);
    motivationPlayedRef.current = false;

    // Generate task based on round
    let task = '';
    let taskExtra: string | null = null;

    if (roundNum === 1) {
      task = generateAbbreviation();
    } else if (roundNum === 2) {
      task = excuses[Math.floor(Math.random() * excuses.length)] || 'Вы опоздали на работу на 3 часа';
    } else if (roundNum === 3) {
      task = brands[Math.floor(Math.random() * brands.length)] || 'Apple';
    } else if (roundNum === 4) {
      // Pick player with most points
      const sorted = [...gamePlayers].sort((a, b) => b.total_points - a.total_points);
      task = sorted[0]?.name || 'Лидер';
    } else if (roundNum === 5) {
      task = generateAbbreviation();
      taskExtra = themes[Math.floor(Math.random() * themes.length)] || 'Кинематограф';
    }

    const isFinal = roundNum === 5;
    await updateCreativachRoom(room.id, {
      current_round: roundNum,
      round_task: task,
      round_task_extra: taskExtra,
      status: isFinal ? 'final_rules' : 'round_rules',
      voting_phase: 'idle',
      timer_started_at: null,
    });

    setShowRulesModal(true);
    audioRef.current?.stopBgm();
    audioRef.current?.playBgm(CREATIVACH_AUDIO.betweenMusic, 0.3, false);
    await audioRef.current?.playRoundRules(roundNum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, excuses, brands, themes, gamePlayers]);

  const startAnswering = useCallback(async () => {
    if (!room) return;
    setShowRulesModal(false);
    const isFinal = room.current_round === 5;
    await updateCreativachRoom(room.id, {
      status: isFinal ? 'final_playing' : 'round_playing',
      voting_phase: 'answering',
      timer_started_at: new Date().toISOString(),
      timer_duration_sec: ANSWER_TIME_SEC,
    });
    audioRef.current?.stopBgm();
    audioRef.current?.playBgm(CREATIVACH_AUDIO.timer60Music, 0.3, false);
  }, [room]);

  const handleNextRound = useCallback(async () => {
    if (!room) return;
    const next = room.current_round + 1;
    if (next <= TOTAL_ROUNDS) {
      audioRef.current?.stopBgm();
      audioRef.current?.playBgm(CREATIVACH_AUDIO.betweenMusic, 0.3, false);
      await startRound(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, startRound]);

  const handleForceNext = useCallback(async () => {
    if (!room) return;
    if (room.voting_phase === 'answering') {
      await updateCreativachRoom(room.id, {
        voting_phase: 'voting',
        timer_started_at: new Date().toISOString(),
        timer_duration_sec: VOTE_TIME_SEC,
      });
    } else if (room.voting_phase === 'voting') {
      await calculateAndShowResults();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, calculateAndShowResults]);

  const handlePlayAgain = useCallback(async () => {
    if (!room) return;
    await resetAllPoints(room.id);
    await updateCreativachRoom(room.id, {
      status: 'lobby',
      current_round: 0,
      round_task: null,
      round_task_extra: null,
      voting_phase: 'idle',
      timer_started_at: null,
      timer_duration_sec: 60,
    });
    setShowConfetti(false);
    setResultsRevealed(false);
    audioRef.current?.stopBgm();
    audioRef.current?.playBgm(CREATIVACH_AUDIO.lobbyMusic);
  }, [room]);

  const handleCloseRoom = useCallback(async () => {
    if (!room) return;
    await updateCreativachRoom(room.id, { status: 'finished' });
    creativachStorage.clear();
    router.push('/creativach');
  }, [room, router]);

  const handleExit = useCallback(() => {
    creativachStorage.clear();
    router.push('/creativach');
  }, [router]);

  // Check all players submitted
  useEffect(() => {
    if (!room || room.voting_phase !== 'answering') return;
    if (answers.length >= gamePlayers.length && gamePlayers.length > 0) {
      // All submitted, skip to voting early
      handleTimerEnd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.length, gamePlayers.length, room?.voting_phase]);

  /* ══════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════ */

  if (!room) {
    return (
      <div className="min-h-screen bg-[#FF6B35] flex items-center justify-center">
        <div className="cartoon-panel p-8 text-center">
          <p className="text-xl font-black text-black">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FF6B35] text-white overflow-hidden relative">
      {showConfetti && <ConfettiCanvas />}

      {/* Фон */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="creativach-sunrays" />
      </div>

      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black tracking-tight drop-shadow-[2px_2px_0_#000]">Креативач</h1>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">#{code}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleForceNext} className="px-3 py-1 rounded-xl text-xs border-2 bg-yellow-400 text-black border-black hover:scale-110 transition-transform shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" title="Принудительный переход">
            Дальше ⏩
          </button>
          <a href="https://donatty.com/aleksandri" target="_blank" rel="noopener noreferrer" className="px-3 py-1 rounded-xl text-xs border-2 bg-pink-400 text-black border-black hover:scale-110 transition-transform shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            Поддержать 💖
          </a>
          <button onClick={handleCloseRoom} className="px-3 py-1 rounded-xl text-xs border-2 bg-red-500 text-white border-black hover:scale-110 transition-transform shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            Закрыть ✕
          </button>
        </div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ─── LOBBY ─── */}
        {room.status === 'lobby' && (
          <div className="space-y-6 animate-[fadeIn_0.4s_ease]">
            <div className="cartoon-panel p-6 text-center space-y-4">
              <h2 className="text-3xl font-black text-black">Лобби</h2>
              <p className="text-gray-700 font-medium">Код комнаты: <span className="text-4xl font-black text-black tracking-[0.3em]">{code}</span></p>
              <p className="text-sm text-gray-600">Игроки: {gamePlayers.length}/{MIN_PLAYERS}+ | Зрители: {spectators.length}</p>
            </div>

            {/* Players grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {gamePlayers.map((p, i) => (
                <div key={p.id} className="cartoon-panel p-3 text-center animate-[fadeIn_0.3s_ease]" style={{ animationDelay: `${i * 0.1}s` }}>
                  <img src={`/audio/sound/Jokester/ava/${p.avatar}`} alt={p.name} className="w-16 h-16 mx-auto rounded-xl border-3 border-black shadow-[2px_2px_0_#000]" />
                  <p className="text-xs font-black text-black mt-2 truncate">{p.name}</p>
                </div>
              ))}
            </div>

            <button
              onClick={startGame}
              disabled={!canStart}
              className={`w-full py-4 text-xl font-black ${canStart ? 'cartoon-button animate-pulse' : 'cartoon-panel opacity-50 cursor-not-allowed'}`}
            >
              {canStart ? '🎮 Начать Креативач' : `⏳ Ожидаем игроков (${gamePlayers.length}/${MIN_PLAYERS})`}
            </button>
          </div>
        )}

        {/* ─── RULES MODAL ─── */}
        {showRulesModal && currentRoundInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fadeIn_0.3s_ease]">
            <div className="cartoon-panel p-8 max-w-lg mx-4 text-center space-y-6 animate-[fadeIn_0.3s_ease]">
              <div className="bg-[#FF6B35] text-white px-4 py-2 rounded-xl inline-block border-2 border-black shadow-[2px_2px_0_#000]">
                <span className="font-black text-lg">Раунд {currentRoundInfo.number}</span>
              </div>
              <h2 className="text-3xl font-black text-black">{currentRoundInfo.title}</h2>
              <p className="text-gray-700 font-medium leading-relaxed">{currentRoundInfo.description}</p>

              {/* Show task preview */}
              {room.round_task && (
                <div className="bg-yellow-100 border-2 border-yellow-500 rounded-xl p-4">
                  {(room.current_round === 1 || room.current_round === 5) && (
                    <p className="text-4xl font-black text-black tracking-[0.3em]">{room.round_task}</p>
                  )}
                  {room.current_round === 2 && (
                    <p className="text-lg font-bold text-black">«{room.round_task}»</p>
                  )}
                  {room.current_round === 3 && (
                    <p className="text-2xl font-black text-black">{room.round_task}</p>
                  )}
                  {room.current_round === 4 && (
                    <p className="text-lg font-bold text-black">Сделайте комплимент игроку «{room.round_task}»</p>
                  )}
                  {room.current_round === 5 && room.round_task_extra && (
                    <p className="text-sm font-medium text-gray-600 mt-2">Тема: {room.round_task_extra}</p>
                  )}
                </div>
              )}

              <button onClick={startAnswering} className="cartoon-button py-3 px-8 text-lg">
                🚀 Поехали!
              </button>
            </div>
          </div>
        )}

        {/* ─── ANSWERING PHASE ─── */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'answering' && (
          <div className="space-y-6 animate-[fadeIn_0.3s_ease]">
            <div className="cartoon-panel p-6 text-center space-y-4">
              <div className="bg-[#FF6B35] text-white px-4 py-2 rounded-xl inline-block border-2 border-black shadow-[2px_2px_0_#000]">
                <span className="font-black">Раунд {room.current_round}: {currentRoundInfo?.title}</span>
              </div>

              {/* Task display */}
              <div className="bg-yellow-100 border-2 border-yellow-500 rounded-xl p-4">
                {(room.current_round === 1 || room.current_round === 5) && (
                  <p className="text-5xl font-black text-black tracking-[0.3em]">{room.round_task}</p>
                )}
                {room.current_round === 2 && (
                  <p className="text-xl font-bold text-black">«{room.round_task}»</p>
                )}
                {room.current_round === 3 && (
                  <p className="text-3xl font-black text-black">{room.round_task}</p>
                )}
                {room.current_round === 4 && (
                  <p className="text-xl font-bold text-black">Сделайте комплимент игроку «{room.round_task}»</p>
                )}
                {room.current_round === 5 && room.round_task_extra && (
                  <p className="text-lg font-medium text-gray-600 mt-2">Тема: {room.round_task_extra}</p>
                )}
              </div>

              <TimerCircle seconds={timerSec} total={ANSWER_TIME_SEC} label="ввод ответов" />

              <p className="text-sm text-gray-600 font-bold">
                Ответов: {answers.length} / {gamePlayers.length}
              </p>
            </div>
          </div>
        )}

        {/* ─── VOTING PHASE ─── */}
        {(room.status === 'round_playing' || room.status === 'final_playing' || room.status === 'round_voting' || room.status === 'final_voting') && room.voting_phase === 'voting' && (
          <div className="space-y-6 animate-[fadeIn_0.3s_ease]">
            <div className="cartoon-panel p-6 text-center space-y-4">
              <h2 className="text-2xl font-black text-black">🗳️ Голосование</h2>
              <p className="text-gray-600 font-medium">Выберите самый креативный ответ!</p>
              <TimerCircle seconds={timerSec} total={VOTE_TIME_SEC} label="голосование" />
            </div>

            {/* Show answers anonymously */}
            <div className="grid gap-3">
              {answers.map((a, i) => (
                <div key={a.id} className="cartoon-panel p-4 animate-[fadeIn_0.3s_ease]" style={{ animationDelay: `${i * 0.1}s` }}>
                  <p className="text-lg font-bold text-black">{a.answer_text}</p>
                  <p className="text-xs text-gray-500 mt-1">Голоса: {voteResults.get(a.player_id) || 0}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── RESULTS PHASE ─── */}
        {(room.status === 'round_results' || room.status === 'final_results') && resultsRevealed && (
          <div className="space-y-6 animate-[fadeIn_0.4s_ease]">
            <div className="cartoon-panel p-6 text-center">
              <h2 className="text-3xl font-black text-black">
                {room.status === 'final_results' ? '🏆 Финальные результаты!' : `📊 Результаты раунда ${room.current_round}`}
              </h2>
            </div>

            {/* Answers with authors revealed */}
            <div className="space-y-3">
              {answersWithVotes.map((a, i) => (
                <div
                  key={a.id}
                  className={`cartoon-panel p-4 flex items-center gap-4 animate-[fadeIn_0.3s_ease] ${
                    i === 0 ? '!border-yellow-500 !bg-yellow-50' : ''
                  }`}
                  style={{ animationDelay: `${i * 0.15}s` }}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#FF6B35] border-2 border-black flex items-center justify-center font-black text-white shadow-[2px_2px_0_#000]">
                    {i + 1}
                  </div>
                  {a.player && (
                    <img src={`/audio/sound/Jokester/ava/${a.player.avatar}`} alt={a.player.name} className="w-12 h-12 rounded-xl border-2 border-black" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-black truncate">{a.player?.name || '???'}</p>
                    <p className="text-gray-700 text-sm">{a.answer_text}</p>
                  </div>
                  <div className="text-center flex-shrink-0">
                    <span className="text-2xl font-black text-[#FF6B35]">{a.voteCount}</span>
                    <p className="text-xs text-gray-500">голосов</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Leaderboard */}
            <div className="cartoon-panel p-6 space-y-3">
              <h3 className="text-2xl font-black text-black text-center">🏅 Рейтинг</h3>
              {sortedByPoints.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
                    i === 0 ? 'bg-yellow-100 border-yellow-500' : i === 1 ? 'bg-gray-100 border-gray-400' : i === 2 ? 'bg-orange-50 border-orange-400' : 'bg-white border-gray-200'
                  } animate-[fadeIn_0.3s_ease]`}
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <span className="font-black text-xl w-8 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <img src={`/audio/sound/Jokester/ava/${p.avatar}`} alt={p.name} className="w-10 h-10 rounded-xl border-2 border-black" />
                  <span className="font-bold text-black flex-1 truncate">{p.name}</span>
                  <span className="font-black text-xl text-[#FF6B35]">{p.total_points}</span>
                  <span className="text-xs text-gray-500">очков</span>
                </div>
              ))}
            </div>

            {/* Next round / finish buttons */}
            {room.status === 'round_results' && room.current_round < TOTAL_ROUNDS && (
              <button onClick={handleNextRound} className="w-full py-4 text-xl font-black cartoon-button">
                {room.current_round === TOTAL_ROUNDS - 1 ? '🏆 Финал' : `▶ Раунд ${room.current_round + 1}`}
              </button>
            )}

            {room.status === 'final_results' && (
              <div className="space-y-3">
                {/* Winner highlight */}
                {sortedByPoints[0] && (
                  <div className="cartoon-panel p-8 text-center space-y-4 !border-yellow-500 !bg-gradient-to-b from-yellow-50 to-white animate-[fadeIn_0.5s_ease]">
                    <p className="text-lg font-bold text-gray-600">🎉 Победитель</p>
                    <img
                      src={`/audio/sound/Jokester/ava/${sortedByPoints[0].avatar}`}
                      alt={sortedByPoints[0].name}
                      className="w-24 h-24 mx-auto rounded-2xl border-4 border-yellow-500 shadow-[4px_4px_0_#000]"
                    />
                    <h2 className="text-4xl font-black text-black">{sortedByPoints[0].name}</h2>
                    <p className="text-2xl font-black text-[#FF6B35]">{sortedByPoints[0].total_points} очков</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={handlePlayAgain} className="flex-1 py-4 text-lg font-black cartoon-button-blue">
                    🔄 Играть ещё
                  </button>
                  <button onClick={handleExit} className="flex-1 py-4 text-lg font-black cartoon-button">
                    🚪 Выйти
                  </button>
                  <a href="https://donatty.com/aleksandri" target="_blank" rel="noopener noreferrer" className="flex-1 py-4 text-lg font-black cartoon-button-purple text-center">
                    💖 Поддержать
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── FINISHED ─── */}
        {room.status === 'finished' && (
          <div className="cartoon-panel p-8 text-center space-y-4 animate-[fadeIn_0.3s_ease]">
            <h2 className="text-3xl font-black text-black">Игра завершена</h2>
            <button onClick={handleExit} className="cartoon-button py-3 px-8 text-lg">
              🏠 На главную
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .creativach-sunrays {
          position: absolute;
          inset: -100%;
          background: repeating-conic-gradient(from 0deg, #FF6B35 0deg 15deg, #E85D2C 15deg 30deg);
          animation: spin 120s linear infinite;
          z-index: 0;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
