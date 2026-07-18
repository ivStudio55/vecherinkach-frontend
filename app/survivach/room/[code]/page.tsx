// app/survivach/room/[code]/page.tsx
// Экран игрока «Выживач»
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type {
  SurvivachRoom,
  SurvivachPlayer,
  SurvivachAnswer,
  SurvivachBet,
  SurvivachDuel,
  RoundMode,
  DuelMode,
  MathProblem,
  BetOption,
} from '@/lib/survivach/types';
import {
  fetchRoomByCode,
  fetchPlayers,
  fetchActiveDuel,
  fetchLastDuelMode,
  joinSurvivachRoom,
  submitAnswer,
  submitBet,
  updateDuel,
  mergeDuelPlayerVote,
  mergeDuelPlayerGuess,
  mergeDuelPlayerMine,
  updatePlayer,
  createDuel,
  setRoomStatus,
  loadDuelQuestions,
  survivachStorage,
  subscribeRoom,
  subscribeRoomPlayers,
  subscribeRoomDuel,
  subscribeRoomAnswers,
  passPotatoBomb,
} from '@/lib/survivach/api';
import {
  DUCK_AVATARS,
  getAvatarUrl,
  MODE_LABELS,
  MODE_COLORS,
  MEMORY_COLORS,
  BLITZ_START,
  TOTAL_CELLS,
  rankPlayers,
} from '@/lib/survivach/board';
import { SurvivachAudio, randomFromPool, SCREAM_POOL } from '@/lib/survivach/audio';
import { getRandomDuelMode } from '@/lib/survivach/gameModes';

/* ── Types ── */
type JoinPhase = 'choose_avatar' | 'enter_name' | 'waiting';

/* ── Color sequence input ── */
function ColorSequenceInput({
  sequence,
  onSubmit,
}: {
  sequence: string[];
  onSubmit: (input: string[]) => void;
}) {
  const [input, setInput] = useState<string[]>([]);
  const colors = Object.keys(MEMORY_COLORS);

  const tap = (c: string) => {
    if (input.length >= sequence.length) return;
    const next = [...input, c];
    setInput(next);
    if (next.length === sequence.length) {
      onSubmit(next);
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-6 bg-slate-900/60 p-6 rounded-[2rem] border border-pink-500/30 shadow-[0_0_50px_rgba(236,72,153,0.15)] backdrop-blur-xl relative overflow-hidden">
      {/* Ambient pink/purple glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-pink-500/10 blur-[100px] pointer-events-none rounded-full" />
      
      <div className="relative z-10 flex flex-col items-center w-full">
        <p className="text-pink-200/60 text-xs font-bold uppercase tracking-[0.2em] mb-4">
          Ввод сигнала: {input.length} / {sequence.length}
        </p>
        
        {/* Input Slots */}
        <div className="flex justify-center gap-3 w-full bg-black/40 p-4 rounded-2xl border-2 border-slate-800 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] mb-6">
          {Array.from({ length: sequence.length }).map((_, i) => (
            <div key={i} className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-white/20 bg-black/50" />
              {input[i] && (
                <div 
                  className="absolute inset-0 rounded-full shadow-lg animate-in zoom-in duration-200"
                  style={{ 
                    backgroundColor: MEMORY_COLORS[input[i]],
                    boxShadow: `0 0 20px ${MEMORY_COLORS[input[i]]}80, inset 0 0 10px rgba(255,255,255,0.5)` 
                  }} 
                />
              )}
            </div>
          ))}
        </div>

        {/* Color buttons */}
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 max-w-[280px]">
          {colors.map(c => (
            <button
              key={c}
              onClick={() => tap(c)}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl border-b-4 hover:-translate-y-1 active:scale-95 active:translate-y-0 active:border-b-0 active:mt-1 transition-all flex items-center justify-center relative shadow-lg"
              style={{ 
                backgroundColor: MEMORY_COLORS[c],
                borderColor: 'rgba(0,0,0,0.4)',
                boxShadow: `0 8px 20px ${MEMORY_COLORS[c]}40`
              }}
            >
              {/* Inner glossy highlight */}
              <div className="absolute top-1 left-1 right-1 bottom-1/2 bg-gradient-to-b from-white/30 to-transparent rounded-t-xl sm:rounded-t-2xl pointer-events-none" />
            </button>
          ))}
        </div>

        {input.length > 0 && (
          <button 
            onClick={() => setInput([])} 
            className="mt-6 px-6 py-2 bg-red-950/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 rounded-full font-bold uppercase tracking-widest text-xs transition-colors"
          >
            Сбросить ⚠️
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Tag puzzle (3×3 or 4×4 sliding) ── */
function TagPuzzle({
  size,
  initialState,
  onSolve,
}: {
  size: number;
  initialState: number[];
  onSolve: () => void;
}) {
  const [tiles, setTiles] = useState<number[]>(initialState);
  const [solved, setSolved] = useState(false);

  const isSolved = (t: number[]) => t.every((v, i) => v === (i === t.length - 1 ? 0 : i + 1));

  const move = (idx: number) => {
    if (solved) return;
    const emptyIdx = tiles.indexOf(0);
    const r1 = Math.floor(idx / size), c1 = idx % size;
    const r2 = Math.floor(emptyIdx / size), c2 = emptyIdx % size;
    const adjacent = (Math.abs(r1 - r2) === 1 && c1 === c2) || (Math.abs(c1 - c2) === 1 && r1 === r2);
    if (!adjacent) return;
    const next = [...tiles];
    [next[idx], next[emptyIdx]] = [next[emptyIdx], next[idx]];
    setTiles(next);
    if (isSolved(next)) {
      setSolved(true);
      onSolve();
    }
  };

  return (
    <div className={`w-full aspect-square relative bg-[#05070a] flex items-center justify-center p-2 isolate transition-all duration-700 ${solved ? 'shadow-[0_0_80px_rgba(74,222,128,0.3)]' : ''}`}>
      {/* Container with ultra-thin tech borders & corners */}
      <div className={`absolute inset-0 border transition-colors duration-500 z-0 ${solved ? 'border-green-500/50' : 'border-white/10'}`} />
      <div className={`absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 z-10 transition-colors duration-500 ${solved ? 'border-green-400' : 'border-cyan-500/60'}`} />
      <div className={`absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 z-10 transition-colors duration-500 ${solved ? 'border-green-400' : 'border-cyan-500/60'}`} />
      <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 z-10 transition-colors duration-500 ${solved ? 'border-green-400' : 'border-cyan-500/60'}`} />
      <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 z-10 transition-colors duration-500 ${solved ? 'border-green-400' : 'border-cyan-500/60'}`} />

      {/* Grid mapping */}
      <div 
        className="w-full h-full grid gap-2 relative z-20"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      >
        {tiles.map((v, i) => (
          <div key={i} className="relative w-full h-full flex">
            {v !== 0 ? (
              <button
                onClick={() => move(i)}
                className={`
                  w-full h-full flex flex-col items-center justify-center
                  backdrop-blur-md transition-all duration-200 active:scale-95 touch-manipulation
                  ${solved 
                    ? 'bg-green-500/20 border border-green-400/80 shadow-[inset_0_0_20px_rgba(74,222,128,0.4)]' 
                    : 'bg-[#10141f]/70 hover:bg-[#1a2030]/80 border border-cyan-900/40 shadow-[0_4px_24px_rgba(0,0,0,0.4)] active:border-cyan-400/80 active:bg-cyan-900/30'
                  }
                `}
              >
                <span className={`font-mono font-black text-4xl sm:text-5xl lg:text-6xl drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] ${solved ? 'text-green-300' : 'text-cyan-100'}`}>
                  {v}
                </span>

                {/* Subtle glass reflection */}
                <div className="absolute top-1 left-2 right-2 h-1/4 bg-gradient-to-b from-white/10 to-transparent rounded-[20%] pointer-events-none" />
              </button>
            ) : (
              <div className="w-full h-full bg-black/40 border border-dashed border-cyan-900/30 flex items-center justify-center shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]">
                {/* Empty target mark */}
                <div className="w-1/4 h-1/4 mix-blend-screen opacity-20 border border-cyan-500" />
              </div>
            )}
          </div>
        ))}
      </div>

      {solved && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50 animate-in fade-in zoom-in duration-500 mb-10">
          <div className="bg-black/90 text-green-400 border border-green-500 px-6 py-2 rounded-sm font-mono tracking-[0.3em] font-black text-xl shadow-[0_0_30px_rgba(74,222,128,0.5)] uppercase rotate-[-4deg]">
            УСПЕХ
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Math input ── */
function MathProblemInput({
  problems,
  timerSec,
  onDone,
}: {
  problems: MathProblem[];
  timerSec: number;
  onDone: (correctCount: number, answers: number[]) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [inputVal, setInputVal] = useState('');
  const [correctCount, setCorrectCount] = useState(0);
  const [myAnswers, setMyAnswers] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timerSec);

  useEffect(() => {
    const iv = setInterval(() => setTimeLeft(t => {
      if (t <= 1) { clearInterval(iv); handleDone(); return 0; }
      return t - 1;
    }), 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDone = useCallback(() => {
    if (!done) {
      setDone(true);
      onDone(correctCount, myAnswers);
    }
  }, [done, correctCount, myAnswers, onDone]);

  const submit = () => {
    const num = parseInt(inputVal, 10);
    const isOk = !isNaN(num) && num === problems[idx].answer;
    const newCC = correctCount + (isOk ? 1 : 0);
    const newAnswers = [...myAnswers, num];
    setCorrectCount(newCC);
    setMyAnswers(newAnswers);
    setInputVal('');
    if (idx + 1 >= problems.length) {
      setDone(true);
      onDone(newCC, newAnswers);
    } else {
      setIdx(idx + 1);
    }
  };

  if (done) {
    return (
      <div className="text-center text-green-400 font-bold">
        ✅ Готово! Правильных: {correctCount}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`text-3xl font-mono font-black px-4 py-1 rounded-lg ${timeLeft <= 10 ? 'text-red-400 bg-red-900/30 animate-pulse' : 'text-white'}`}>
        ⏱ {timeLeft}s
      </div>
      <div className="text-gray-400 text-sm">{idx + 1} / {problems.length} · Правильных: {correctCount}</div>
      <div className="text-4xl font-black font-mono bg-gray-900 border border-gray-600 rounded-2xl px-8 py-6">
        {problems[idx].expression}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          className="w-32 text-center text-2xl font-mono bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white outline-none focus:border-blue-500"
          autoFocus
        />
        <button onClick={submit} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-lg">
          OK
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main player page component
   ══════════════════════════════════════════ */

export default function SurvivachRoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const [room, setRoom] = useState<SurvivachRoom | null>(null);
  const [players, setPlayers] = useState<SurvivachPlayer[]>([]);
  const [me, setMe] = useState<SurvivachPlayer | null>(null);
  const [duel, setDuel] = useState<SurvivachDuel | null>(null);
  const [myAnswer, setMyAnswer] = useState<SurvivachAnswer | null>(null);
  const [myBet, setMyBet] = useState<SurvivachBet | null>(null);
  const [pendingBetOption, setPendingBetOption] = useState<BetOption | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Join flow ── */
  const [joinPhase, setJoinPhase] = useState<JoinPhase>('choose_avatar');
  const [chosenAvatar, setChosenAvatar] = useState<string>('');
  const [chosenName, setChosenName] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);

  /* ── Answer state ── */
  const [textAnswer, setTextAnswer] = useState('');
  const [choiceAnswer, setChoiceAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showSequence, setShowSequence] = useState(false);
  const [seqTimer, setSeqTimer] = useState(5);
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const [arithmeticInput, setArithmeticInput] = useState('');
  const [duelChallenging, setDuelChallenging] = useState(false);
  const [duelTargets, setDuelTargets] = useState<SurvivachPlayer[]>([]);
  const usedDuelModesHistoryRef = useRef<DuelMode | null>(null);
  const passTimeout = useRef<NodeJS.Timeout | null>(null);
  const prevBombHolderRef = useRef<string | null>(null);
  const gestureCountRef = useRef(0);
  const touchStartXRef = useRef(0);

  /* ── Hot Potato pass action ── */
  const handlePotatoPass = useCallback(async () => {
    if (!room || !me) return;
    const rd = room.round_results_data as any;
    if (room.status !== 'potato_playing' || rd?.potato_bomb_holder !== me.id) return;
    
    // Prevent double passing rapidly
    if (passTimeout.current) return;
    passTimeout.current = setTimeout(() => {
      passTimeout.current = null;
    }, 1000);

    const aliveGamePlayers = players.filter(p => !p.is_host && !p.is_zombie && p.id !== me.id);
    if (aliveGamePlayers.length > 0) {
      const nextId = aliveGamePlayers[Math.floor(Math.random() * aliveGamePlayers.length)].id;
      // Call API
      await passPotatoBomb(room.id, me.id, nextId);
    }
  }, [room, me, players]);

  /* ── Shake detection ── */
  useEffect(() => {
    if (room?.status !== 'potato_playing' || !me) return;
    
    let lastX = 0, lastY = 0, lastZ = 0;
    let lastUpdate = 0;
    const SHAKE_THRESHOLD = 15;

    const onMotion = (e: DeviceMotionEvent) => {
      const rd = room.round_results_data as any;
      // Only care if I hold the bomb
      if (rd?.potato_bomb_holder !== me.id) return;

      const { accelerationIncludingGravity } = e;
      if (!accelerationIncludingGravity) return;

      const { x, y, z } = accelerationIncludingGravity;
      if (x === null || y === null || z === null) return;

      const now = Date.now();
      if ((now - lastUpdate) > 100) {
        const diffTime = (now - lastUpdate);
        lastUpdate = now;

        const speed = Math.abs(x + y + z - lastX - lastY - lastZ) / diffTime * 10000;
        
        if (speed > SHAKE_THRESHOLD) {
          handlePotatoPass();
        }

        lastX = x;
        lastY = y;
        lastZ = z;
      }
    };

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [room, me, handlePotatoPass]);

  /* ── Bomb arrival: vibrate + scream, reset gesture counter ── */
  useEffect(() => {
    if (room?.status !== 'potato_playing') {
      prevBombHolderRef.current = null;
      return;
    }
    const rd = room.round_results_data as any;
    const holderId = rd?.potato_bomb_holder as string | undefined;
    if (holderId && holderId === me?.id && prevBombHolderRef.current !== holderId) {
      // Bomb just arrived on my screen!
      if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 500]);
      new Audio(randomFromPool(SCREAM_POOL, 5)).play().catch(() => {});
      gestureCountRef.current = 0;
    }
    prevBombHolderRef.current = holderId ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.round_results_data, me?.id, room?.status]);

  /* ── Fetch & subscribe ── */
  const prevRoundRef = useRef<number | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const prevStateVersionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!room?.id) return;
    const unsubs = [
      subscribeRoom(room.id, r => {
        setRoom(r);
        // Reset answer state when: round changes, status changes, OR state_version changes (for blitz)
        const roundChanged = prevRoundRef.current !== null && prevRoundRef.current !== r.current_round;
        const statusChanged = prevStatusRef.current !== null && prevStatusRef.current !== r.status;
        const stateVersionChanged = prevStateVersionRef.current !== null && prevStateVersionRef.current !== r.state_version;
        if (roundChanged || statusChanged || stateVersionChanged) {
          setSubmitted(false);
          setTextAnswer('');
          setChoiceAnswer(null);
          setMyAnswer(null);
          setPuzzleSolved(false);
          setShowSequence(false);
          if (roundChanged) {
            setMyBet(null);
            setPendingBetOption(null);
            setDuel(null);
          }
        }
        prevRoundRef.current = r.current_round;
        prevStatusRef.current = r.status;
        prevStateVersionRef.current = r.state_version;
      }),
      subscribeRoomPlayers(room.id, pl => {
        setPlayers(pl);
        const session = survivachStorage.get();
        if (session) setMe(pl.find(p => p.id === session.playerId) ?? null);
      }),
      subscribeRoomDuel(room.id, room.current_round, setDuel),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [room?.id, room?.current_round]);

  /* ── Eagerly fetch duel when entering duel phases (with retry) ── */
  useEffect(() => {
    const isDuelPhase = room?.status === 'duel_intro' || room?.status === 'duel_setup' || room?.status === 'duel_playing';
    if (!isDuelPhase || duel || !room) return;
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 10 && !cancelled; i++) {
        const d = await fetchActiveDuel(room.id, room.current_round);
        if (d && !cancelled) { setDuel(d); return; }
        if (i < 9 && !cancelled) await new Promise<void>(r => setTimeout(r, 300));
      }
    };
    poll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, duel]);

  /* ── Memory diary: show sequence timer ── */
  useEffect(() => {
    if (room?.status === 'round_playing' && room.current_mode === 'memory_diary') {
      setShowSequence(true);
      setSeqTimer(5);
      const iv = setInterval(() => setSeqTimer(t => {
        if (t <= 1) { clearInterval(iv); setShowSequence(false); return 0; }
        return t - 1;
      }), 1000);
      return () => clearInterval(iv);
    }
  }, [room?.status, room?.current_mode]);

  /* ── Duel button eligibility (reactive by players/current round) ── */
  useEffect(() => {
    if (!room || !me) {
      setDuelTargets([]);
      return;
    }
    const freshMe = players.find(p => p.id === me.id);
    if (!freshMe || freshMe.karma < 3 || room.current_round === 999 || !!duel) {
      setDuelTargets([]);
      return;
    }
    const targets = players.filter(p =>
      !p.is_host &&
      p.id !== freshMe.id &&
      !p.is_zombie &&
      p.position === freshMe.position + 1
    );
    setDuelTargets(targets);
  }, [players, room?.current_round, me?.id, duel]);

  /* ── Initial load ── */
  useEffect(() => {
    if (!code) return;
    const init = async () => {
      const r = await fetchRoomByCode(code);
      if (!r) { setLoading(false); return; }
      setRoom(r);
      prevRoundRef.current = r.current_round;
      prevStatusRef.current = r.status;
      const pl = await fetchPlayers(r.id);
      setPlayers(pl);

      const session = survivachStorage.get();
      if (session && session.roomCode === code) {
        const existing = pl.find(p => p.id === session.playerId);
        if (existing) {
          setMe(existing);
          setJoinPhase('waiting');
        }
      }
      setLoading(false);
    };
    init();
  }, [code]);

  /* ── Join handlers ── */
  const handleChooseAvatar = (duck: string) => {
    setChosenAvatar(duck);
    setJoinPhase('enter_name');
  };

  const handleJoin = async () => {
    if (!room || !chosenAvatar || !chosenName.trim()) return;
    setJoiningRoom(true);
    setJoinError('');
    try {
      const { player } = await joinSurvivachRoom(code, chosenName.trim(), chosenAvatar);
      setMe(player);
      setJoinPhase('waiting');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('avatar')) setJoinError('Этот персонаж уже занят. Выберите другого.');
      else if (msg.includes('name')) setJoinError('Это имя уже занято. Придумайте другое.');
      else setJoinError('Ошибка подключения. Попробуйте ещё раз.');
    } finally {
      setJoiningRoom(false);
    }
  };

  /* ── Answer submission helpers ── */
  const submitChoiceAnswer = async (optionIdx: number, isCorrectFn: (idx: number) => boolean) => {
    if (!room || !me || submitted) return;
    const correct = isCorrectFn(optionIdx);
    setChoiceAnswer(optionIdx);
    setSubmitted(true);
    await submitAnswer(room.id, me.id, room.current_round, { answer_index: optionIdx, is_correct: correct });
  };

  const submitTextAnswerFn = async (acceptList: string[]) => {
    if (!room || !me || submitted || !textAnswer.trim()) return;
    const correct = acceptList.some(a => a.toLowerCase().trim() === textAnswer.toLowerCase().trim());
    setSubmitted(true);
    await submitAnswer(room.id, me.id, room.current_round, { answer_text: textAnswer, is_correct: correct });
  };

  const handleBet = async (betType: 'life' | 'karma') => {
    if (!room || !me || myBet || !pendingBetOption) return;
    await submitBet(room.id, me.id, room.current_round, betType, pendingBetOption);
    setMyBet({ id: '', room_id: room.id, player_id: me.id, round: room.current_round, bet_type: betType, bet_option: pendingBetOption, resolved: false, won: null, created_at: '' });
  };

  /* ── Duel handlers ── */
  const handleMinePlacement = async (tileIdx: number) => {
    if (!room || !me || !duel || room.status !== 'duel_setup') return;
    const dd = duel.duel_data as { mined_tiles?: Record<string, number[]> } | null;
    const myMines = dd?.mined_tiles?.[me.id] ?? [];
    if (myMines.includes(tileIdx)) return;
    const newMines = [...myMines, tileIdx];
    await mergeDuelPlayerMine(duel.id, me.id, newMines);
  };

  const handleCrowdVote = async (optionIdx: number) => {
    if (!room || !me || !duel || room.status !== 'duel_setup') return;
    const dd = duel.duel_data as { player_votes?: Record<string, number> } | null;
    if (dd?.player_votes?.[me.id] != null) return;
    await mergeDuelPlayerVote(duel.id, me.id, optionIdx);
  };

  const handleCrowdGuess = async (guessNum: number) => {
    if (!room || !me || !duel || room.status !== 'duel_setup') return;
    const dd = duel.duel_data as { player_guesses?: Record<string, number> } | null;
    if (dd?.player_guesses?.[me.id] != null) return;
    await mergeDuelPlayerGuess(duel.id, me.id, guessNum);
  };

  const handleDuelPickTile = async (tileIdx: number) => {
    if (!room || !me || !duel || room.status !== 'duel_playing') return;
    const isChallenger = duel.challenger_id === me.id;
    const dd = duel.duel_data as {
      mined_tiles?: Record<string, number[]>;
      challenger_picks?: number[];
      challenged_picks?: number[];
      challenger_pick_at?: number | null;
      challenged_pick_at?: number | null;
    } | null;
    const myPicks = isChallenger ? (dd?.challenger_picks ?? []) : (dd?.challenged_picks ?? []);
    const opponentPicks = isChallenger ? (dd?.challenged_picks ?? []) : (dd?.challenger_picks ?? []);
    if (myPicks.includes(tileIdx)) return;
    if (opponentPicks.includes(tileIdx)) return;
    const newPicks = [...myPicks, tileIdx];
    const allMines: number[] = Object.values(dd?.mined_tiles ?? {}).flat();
    const hitMine = allMines.includes(tileIdx);
    const pickAt = Date.now();
    const updatedData = isChallenger
      ? { ...dd, challenger_picks: newPicks, challenger_pick_at: pickAt }
      : { ...dd, challenged_picks: newPicks, challenged_pick_at: pickAt };
    await updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData });
    if (hitMine) {
      await submitAnswer(room.id, me.id, room.current_round, { answer_data: { hit_mine: true, picks: newPicks }, is_correct: false });
    }
  };

  const handleDuelArithmeticAnswer = async (value: number) => {
    if (!room || !me || !duel) return;
    const isChallenger = duel.challenger_id === me.id;
    const dd = duel.duel_data as { challenger_answer?: number | null; challenged_answer?: number | null; average?: number | null } | null;
    const avg = dd?.average;
    const isCorrect = avg != null ? Math.abs(value - avg) < Math.abs((isChallenger ? (dd?.challenged_answer ?? Infinity) : (dd?.challenger_answer ?? Infinity)) - avg) : false;
    const updatedData = isChallenger
      ? { ...dd, challenger_answer: value }
      : { ...dd, challenged_answer: value };
    await updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData });
    await submitAnswer(room.id, me.id, room.current_round, { answer_data: { arithmetic_guess: value }, is_correct: isCorrect });
  };

  const handleDuelCrowdPrediction = async (optionIdx: number) => {
    if (!room || !me || !duel) return;
    const isChallenger = duel.challenger_id === me.id;
    const updatedData = isChallenger
      ? { ...(duel.duel_data as object), challenger_prediction: optionIdx }
      : { ...(duel.duel_data as object), challenged_prediction: optionIdx };
    await updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData });
    await submitAnswer(room.id, me.id, room.current_round, { answer_data: { crowd_prediction: optionIdx }, is_correct: false });
  };

  const handleInitiateDuelChallenge = async (challengedId: string) => {
    if (!room || !me || duelChallenging) return;
    if (room.status !== 'moving') return;
    const freshMe = players.find(p => p.id === me.id);
    if (!freshMe || (!freshMe.is_zombie && freshMe.karma < 3)) return;
    if ((players.find(p => p.id === challengedId)?.position ?? -999) !== freshMe.position + 1) return;
    // 1-per-round lock: check no existing duel
    const existing = await fetchActiveDuel(room.id, room.current_round);
    if (existing) return;
    setDuelChallenging(true);
    try {
      const lastMode = usedDuelModesHistoryRef.current ?? await fetchLastDuelMode(room.id);
      const duelMode = getRandomDuelMode(lastMode);
      const BASE_URL = 'https://storage.yandexcloud.net/vecherinkach/json/survivach';
      const nonHostCount = players.filter(p => !p.is_host).length;
      let initialDuelData: Record<string, unknown> = {};
      if (duelMode === 'minesweeper') {
        initialDuelData = { mode: 'minesweeper', tile_count: nonHostCount + 2, mined_tiles: {}, challenger_picks: [], challenged_picks: [], exploded_challenger: false, exploded_challenged: false };
      } else if (duelMode === 'arithmetic_mean') {
        const qBank = await loadDuelQuestions(BASE_URL, 'arithmetic_mean');
        const list = (qBank as { questions: unknown[] })?.questions ?? [];
        const q = list[Math.floor(Math.random() * list.length)] as Record<string, unknown>;
        initialDuelData = { mode: 'arithmetic_mean', question: q?.question ?? '', player_guesses: {}, average: null, challenger_answer: null, challenged_answer: null };
      } else {
        const qBank = await loadDuelQuestions(BASE_URL, 'crowd_forecast');
        const list = (qBank as { questions: unknown[] })?.questions ?? [];
        const q = list[Math.floor(Math.random() * list.length)] as Record<string, unknown>;
        initialDuelData = { mode: 'crowd_forecast', question: q?.question ?? '', options: q?.options ?? [], player_votes: {}, majority_index: null, challenger_prediction: null, challenged_prediction: null };
      }
      // Best-effort pre-deduct: if policy/network blocks this update, still allow duel init.
      try {
        if (!freshMe.is_zombie) await updatePlayer(freshMe.id, { karma: freshMe.karma - 3 });
      } catch (karmaErr) {
        console.warn('[DUEL] Karma pre-deduct failed, continuing duel init', karmaErr);
      }
      const newDuel = await createDuel(
        room.id, room.current_round, duelMode,
        freshMe.id, challengedId,
        initialDuelData as unknown as import('@/lib/survivach/types').DuelData,
      );
      usedDuelModesHistoryRef.current = duelMode;
      setDuel(newDuel);
      await setRoomStatus(room.id, 'duel_intro', { duel_data: initialDuelData });
    } catch (err) {
      console.error('Duel challenge failed:', err);
    } finally {
      setDuelChallenging(false);
    }
  };

  /* ─── Loading ─── */
  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white text-2xl animate-pulse">🧟 Загрузка...</div>;
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-white p-8 text-center">
        <h2 className="text-3xl font-black">Комната не найдена</h2>
        <p className="text-gray-400">Проверьте код и попробуйте снова</p>
        <button onClick={() => router.push('/')} className="px-6 py-3 bg-gray-800 rounded-xl">← На главную</button>
      </div>
    );
  }

  /* ── Join flow ── */
  if (!me || joinPhase !== 'waiting') {
    const takenAvatars = players.map(p => p.avatar);

    if (joinPhase === 'choose_avatar') {
      return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 gap-6">
          <h1 className="text-4xl font-black">🧟 Выживач</h1>
          <h2 className="text-xl text-gray-300">Выберите персонажа</h2>
          <div className="grid grid-cols-4 gap-4">
            {DUCK_AVATARS.map(duck => {
              const taken = takenAvatars.includes(duck);
              return (
                <button
                  key={duck}
                  onClick={() => !taken && handleChooseAvatar(duck)}
                  disabled={taken}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    taken
                      ? 'border-gray-700 opacity-40 cursor-not-allowed'
                      : 'border-gray-700 hover:border-yellow-500 hover:bg-yellow-900/20 active:scale-95'
                  }`}
                >
                  <img src={getAvatarUrl(duck, 3)} alt={duck} className="w-16 h-16 object-contain" />
                  {taken && <span className="text-xs text-gray-500">Занято</span>}
                </button>
              );
            })}
          </div>
          {room.status !== 'lobby' && (
            <p className="text-red-400 text-sm font-bold">⚠️ Игра уже началась! Вы можете войти как зритель.</p>
          )}
        </div>
      );
    }

    if (joinPhase === 'enter_name') {
      return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 gap-6">
          <img src={getAvatarUrl(chosenAvatar, 3)} alt="" className="w-28 h-28 object-contain" />
          <h2 className="text-xl font-bold">Введите ваше имя</h2>
          <input
            type="text"
            maxLength={16}
            placeholder="Имя игрока..."
            value={chosenName}
            onChange={e => setChosenName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            className="w-64 text-center text-xl bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500"
            autoFocus
          />
          {joinError && <p className="text-red-400 text-sm">{joinError}</p>}
          <div className="flex gap-3">
            <button onClick={() => setJoinPhase('choose_avatar')} className="px-5 py-3 bg-gray-700 rounded-xl">← Назад</button>
            <button
              onClick={handleJoin}
              disabled={!chosenName.trim() || joiningRoom}
              className="px-8 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold disabled:opacity-40"
            >
              {joiningRoom ? 'Вхожу...' : '🎮 Войти'}
            </button>
          </div>
        </div>
      );
    }
  }

  /* ─── Status: me is set, render game view ─── */
  const isDuelist = me && duel && (duel.challenger_id === me.id || duel.challenged_id === me.id);
  const qData = room.question_data as Record<string, unknown> | null;
  const showPersistentDuelPanel = !!me && me.karma >= 3 && !duel && duelTargets.length > 0 && room.status === 'moving';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ── Me status bar ── */}
      {me && (
        <div className="fixed top-0 left-0 right-0 bg-gray-900/95 border-b border-gray-700 flex items-center gap-3 px-4 py-2 z-50">
          <img src={getAvatarUrl(me.avatar, me.lives)} alt="" className="w-8 h-8 object-contain" />
          <span className="font-bold text-sm">{me.name}</span>
          {(() => {
            const gamePlayers = players.filter(p => !p.is_host);
            const ranked = rankPlayers(gamePlayers);
            const myRank = ranked.findIndex(p => p.id === me.id) + 1;
            const total = gamePlayers.length;
            return myRank > 0 ? (
              <span className={`text-xs font-black px-1.5 py-0.5 rounded ${myRank === 1 ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-300'}`}>
                #{myRank}/{total}
              </span>
            ) : null;
          })()}
          <span className="text-sm">📍{me.position}</span>
          <span className="text-sm text-red-400">{'❤️'.repeat(me.lives)}{'🖤'.repeat(Math.max(0, 3 - me.lives))}</span>
          {me.karma > 0 && <span className={`text-sm font-bold ${me.karma >= 3 ? 'text-yellow-300' : 'text-gray-400'}`}>✨{me.karma}</span>}
          {me.is_zombie && <span className="text-green-400 font-bold">🧟</span>}
          <div className="ml-auto text-xs text-gray-500">Раунд {room.current_round}</div>
        </div>
      )}

      <div className="pt-16 flex-1 flex flex-col">
        {/* ────────── LOBBY ────────── */}
        {room.status === 'lobby' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <h1 className="text-4xl font-black text-center">🧟 Выживач</h1>
            <p className="text-gray-400">Ожидание игроков...</p>
            <div className="grid grid-cols-4 gap-3">
              {players.filter(p => !p.is_host).map(p => (
                <div key={p.id} className={`flex flex-col items-center gap-1 p-3 rounded-xl border ${
                  p.id === me?.id ? 'border-yellow-500 bg-yellow-900/20' : 'border-gray-700 bg-gray-900'
                }`}>
                  <img src={getAvatarUrl(p.avatar, 3)} alt="" className="w-12 h-12 object-contain" />
                  <span className="text-xs font-bold truncate max-w-full">{p.name}</span>
                  {p.id === me?.id && <span className="text-xs text-yellow-400">Это вы</span>}
                </div>
              ))}
            </div>
            <p className="text-gray-500 text-sm animate-pulse">{players.filter(p => !p.is_host).length} игроков подключено</p>
          </div>
        )}

        {/* ────────── RULES ────────── */}
        {room.status === 'rules' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 text-center">
            <h2 className="text-3xl font-black">📜 Правила</h2>
            <div className="max-w-sm text-sm text-gray-300 leading-relaxed space-y-2">
              <p>✅ Правильный → +1 клетка. Первый → +2.</p>
              <p>❌ Ошибка → стой на месте, −1 жизнь.</p>
              <p>🧟 3 ошибки → зомби. Зомби всегда +1.</p>
              <p>✨ 3 правильных подряд → карма. 3 кармы → дуэль!</p>
              <p>⚡ Клетки 19-26 = БЛИЦ</p>
            </div>
            <p className="text-gray-500 animate-pulse mt-4">Ведущий начнёт игру...</p>
          </div>
        )}

        {/* ────────── MOVING ────────── */}
        {room.status === 'moving' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <h2 className="text-3xl font-black">🎲 Ходим!</h2>
            {me && (
              <div className="flex flex-col items-center gap-2">
                <img src={getAvatarUrl(me.avatar, me.lives)} alt="" className="w-20 h-20 object-contain" />
                <span className="text-lg font-bold">{me.name}</span>
                <span className="text-gray-400">Клетка {me.position}</span>
              </div>
            )}
            {/* Zombie bomb activation button */}
            {me?.is_zombie && !room.zombie_bomb_active && (
              me.karma >= 3 ? (
                <button
                  onClick={async () => {
                    if (!room || !me || me.karma < 3) return;
                    // Deduct 3 karma and activate zombie bomb for next round
                    await updatePlayer(me.id, { karma: me.karma - 3 });
                    const { supabase } = await import('@/lib/supabase');
                    await supabase
                      .from('survivach_rooms')
                      .update({
                        zombie_bomb_active: true,
                        zombie_bomb_player_id: me.id,
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', room.id);
                  }}
                  className="flex flex-col items-center gap-1 px-6 py-3 bg-green-700 hover:bg-green-600 rounded-xl font-bold text-lg animate-pulse"
                >
                  <span>💣 Зомби-бомба!</span>
                  <span className="text-xs font-normal text-green-200">−3 ✨ карма</span>
                </button>
              ) : (
                <div className="flex flex-col items-center gap-1 px-6 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-500 text-sm">
                  <span>💣 Зомби-бомба</span>
                  <span className="text-xs">Нужно 3 ✨ (у тебя {me.karma})</span>
                </div>
              )
            )}
            {me?.is_zombie && room.zombie_bomb_active && (
              <div className="px-6 py-3 bg-green-900/40 border border-green-500 rounded-xl text-green-300 font-bold animate-pulse">
                💣 Бомба активирована!
              </div>
            )}
            <p className="text-gray-500 animate-pulse">Ждите вопроса...</p>
          </div>
        )}

        {/* ────────── ROUND INTRO ────────── */}
        {room.status === 'round_intro' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <div className="text-6xl font-black animate-bounce">
              {MODE_LABELS[room.current_mode as RoundMode]?.split(' ')[0] ?? '🎮'}
            </div>
            <h2 className="text-2xl font-bold text-center" style={{ color: MODE_COLORS[room.current_mode as RoundMode] }}>
              {MODE_LABELS[room.current_mode as RoundMode]}
            </h2>
            {room.zombie_bomb_active && (
              <div className="px-4 py-2 bg-green-900/40 border border-green-500 rounded-xl text-green-300 font-bold animate-pulse">
                💣 ЗОМБИ-БОМБА!
              </div>
            )}
            <p className="text-gray-500 animate-pulse">Готовьтесь!</p>
          </div>
        )}

        {/* ────────── ROUND PLAYING ────────── */}
        {room.status === 'round_playing' && qData && (
          <div className="flex-1 flex flex-col p-4 gap-4">
            {submitted ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="text-6xl">
                  {choiceAnswer != null && choiceAnswer === (qData.correct as number) ? '✅' :
                   choiceAnswer != null ? '❌' : '✅'}
                </div>
                <h2 className="text-2xl font-bold text-center">Ответ отправлен!</h2>
                <p className="text-gray-500">Ждите результатов...</p>

                {/* Bet panel (if not already bet and answer submitted, not blitz) */}
                {!myBet && !me?.is_zombie && room.current_mode !== 'blitz' && (
                  <div className="mt-4 w-full max-w-sm mx-auto">
                    <p className="text-center text-gray-300 text-sm font-semibold mb-3 tracking-wide uppercase">🎰 Сделать ставку</p>

                    {/* Step 1: pick prediction */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {([
                        { id: 'all_correct' as BetOption, emoji: '🌟', label: 'Все угадают' },
                        { id: 'majority_correct' as BetOption, emoji: '👥', label: 'Большинство' },
                        { id: 'leader_mistake' as BetOption, emoji: '👑', label: 'Ошибка лидера' },
                        { id: 'all_wrong' as BetOption, emoji: '💀', label: 'Все ошибутся' },
                      ] as const).map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setPendingBetOption(opt.id)}
                          className={`flex flex-col items-center gap-1 px-3 py-3 rounded-2xl border text-sm font-bold transition-all duration-200 active:scale-95 ${
                            pendingBetOption === opt.id
                              ? 'border-yellow-400 bg-yellow-400/20 text-yellow-300 shadow-[0_0_16px_rgba(250,204,21,0.4)]'
                              : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/30'
                          }`}
                        >
                          <span className="text-2xl">{opt.emoji}</span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Step 2: pick stake (only if prediction selected) */}
                    {pendingBetOption && (
                      <div className="flex gap-2 justify-center animate-[fadeIn_0.2s_ease-out]">
                        <button
                          onClick={() => handleBet('life')}
                          className="flex-1 px-4 py-3 bg-red-700/80 hover:bg-red-600 border border-red-500/50 rounded-2xl text-sm font-bold transition-all active:scale-95"
                        >❤️ Жизнь</button>
                        {me && me.karma >= 2 && (
                          <button
                            onClick={() => handleBet('karma')}
                            className="flex-1 px-4 py-3 bg-yellow-700/80 hover:bg-yellow-600 border border-yellow-500/50 rounded-2xl text-sm font-bold transition-all active:scale-95"
                          >✨ Карма ×2</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {myBet && room.current_mode !== 'blitz' && (
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <p className="text-yellow-400 font-bold text-sm">🎰 Ставка принята!</p>
                    <p className="text-gray-400 text-xs">
                      {myBet.bet_option === 'all_correct' ? '🌟 Все угадают' :
                       myBet.bet_option === 'majority_correct' ? '👥 Большинство угадает' :
                       myBet.bet_option === 'leader_mistake' ? '👑 Ошибка лидера' :
                       '💀 Все ошибутся'}
                      {' · '}
                      {myBet.bet_type === 'life' ? '❤️ жизнь' : '✨ карма'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* ── УМНИК ── */}
                {room.current_mode === 'umnik' && qData.options && (
                  <div className="flex flex-col gap-6 w-full max-w-lg mx-auto mt-4">
                    <div className="p-6 bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(255,255,255,0.1)] rounded-3xl text-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                      <h2 className="text-2xl font-black tracking-wide leading-snug drop-shadow-md text-white relative z-10">{qData.question as string}</h2>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {(qData.options as string[]).map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => submitChoiceAnswer(i, idx => idx === (qData.correct as number))}
                          className="group relative px-5 py-4 bg-white/5 backdrop-blur-md border border-white/10 hover:border-purple-400/60 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] rounded-2xl flex items-center text-left transition-all duration-300 active:scale-95 overflow-hidden"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                          <span className="text-2xl font-black mr-4 text-purple-300/50 group-hover:text-purple-400/80 drop-shadow-sm transition-colors">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-lg font-semibold text-white/90 drop-shadow-sm tracking-wide z-10">
                            {opt}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── ART HISTORIAN ── */}
                {room.current_mode === 'art_historian' && (
                  <div className="flex flex-col gap-4">
                    <h2 className="text-lg font-bold text-center">{qData.question as string}</h2>
                    <img
                      src={qData.image_url as string}
                      alt="artwork"
                      className={`max-h-52 object-contain rounded-xl mx-auto ${room.zombie_bomb_active ? 'blur-md' : ''}`}
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ваш ответ..."
                        value={textAnswer}
                        onChange={e => setTextAnswer(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitTextAnswerFn(qData.accept_answer as string[])}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500"
                        autoFocus
                      />
                      <button
                        onClick={() => submitTextAnswerFn(qData.accept_answer as string[])}
                        className="px-4 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold"
                      >OK</button>
                    </div>
                  </div>
                )}

                {/* ── INTERPRETER ── */}
                {room.current_mode === 'interpreter' && (
                  <div className="flex flex-col gap-4">
                    <div className="bg-gray-900 border border-purple-500/40 rounded-2xl p-4 text-purple-200 italic">
                      "{qData.translated_text as string}"
                    </div>
                    <p className="text-gray-400 text-sm text-center">
                      {room.zombie_bomb_active ? '💣 Только название песни' : 'Название песни или исполнитель'}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ваш ответ..."
                        value={textAnswer}
                        onChange={e => setTextAnswer(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitTextAnswerFn(qData.accept_answer as string[])}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500"
                        autoFocus
                      />
                      <button
                        onClick={() => submitTextAnswerFn(qData.accept_answer as string[])}
                        className="px-4 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold"
                      >OK</button>
                    </div>
                  </div>
                )}

                {/* ── MATHEMATICIAN ── */}
                {room.current_mode === 'mathematician' && qData.problems && (
                  <MathProblemInput
                    problems={qData.problems as MathProblem[]}
                    timerSec={(qData.timer_sec as number) ?? 60}
                    onDone={async (correctCount, myAnswers) => {
                      if (!room || !me) return;
                      setSubmitted(true);
                      await submitAnswer(room.id, me.id, room.current_round, { answer_data: { correct_count: correctCount, answers: myAnswers }, is_correct: correctCount > 0 });
                    }}
                  />
                )}

                {/* ── MEMORY DIARY ── */}
                {room.current_mode === 'memory_diary' && (
                  <div className="flex-1 flex flex-col justify-center items-center">
                    {showSequence ? (
                      <div className="relative w-full max-w-md bg-slate-900/80 p-8 rounded-[2rem] border border-pink-500/40 shadow-[0_0_80px_rgba(236,72,153,0.2)] backdrop-blur-xl flex flex-col items-center overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-pink-600/10 via-transparent to-transparent pointer-events-none" />
                        
                        <div className="text-pink-300 font-bold uppercase tracking-[0.3em] text-sm mb-2 animate-pulse">
                          Сканирование
                        </div>
                        <h2 className="text-3xl font-black mb-8 bg-gradient-to-br from-white to-pink-200 bg-clip-text text-transparent tracking-wide">
                          ЗАПОМНИТЕ!
                        </h2>
                        
                        <div className="relative flex justify-center w-full px-4 py-8 bg-black/50 rounded-3xl border-4 border-slate-800 shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]">
                          <div className="absolute top-1/2 left-4 right-4 h-1 bg-white/5 -translate-y-1/2 rounded-full hidden sm:block" />
                          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 relative z-10 w-full px-2">
                            {(qData.sequence as string[]).map((c, i) => (
                              <div 
                                key={i} 
                                className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 rounded-2xl flex items-center justify-center animate-in zoom-in duration-300 relative shadow-2xl"
                                style={{ 
                                  backgroundColor: MEMORY_COLORS[c],
                                  animationDelay: `${i * 150}ms`,
                                  boxShadow: `0 0 30px ${MEMORY_COLORS[c]}80, inset 0 0 20px rgba(255,255,255,0.4)`
                                }}
                              >
                                <div className="absolute top-1 left-2 right-2 h-1/3 bg-white/30 rounded-t-xl" />
                                <span className="text-black/30 font-black text-xl sm:text-2xl">{i + 1}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-500">
                        <h2 className="text-2xl sm:text-3xl font-black text-center mb-6 bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(236,72,153,0.5)]">
                          ВОСПРОИЗВЕДИТЕ
                        </h2>
                        <ColorSequenceInput
                          sequence={qData.sequence as string[]}
                          onSubmit={async (input) => {
                            if (!room || !me) return;
                            const seq = qData.sequence as string[];
                            const correct = input.every((c, i) => c === seq[i]);
                            setSubmitted(true);
                            await submitAnswer(room.id, me.id, room.current_round, { answer_data: { sequence: input }, is_correct: correct });
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAG PUZZLE ── */}
                {room.current_mode === 'tag_puzzle' && qData.initial_state && (
                  <div className="flex flex-col items-center justify-center min-h-0 w-full flex-1">
                    <h2 className="text-xl md:text-2xl font-black bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent uppercase tracking-widest mb-2 flex-none drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">РЕШИТЕ ПЯТНАШКИ!</h2>
                    {!puzzleSolved && <p className="text-cyan-600/70 text-xs font-mono tracking-widest uppercase mb-4 flex-none">Соберите конфигурацию 1-{(qData.size as number) ** 2 - 1}</p>}
                    <div className="w-full max-w-[450px] px-2 flex-shrink-0 flex items-center justify-center">
                      <TagPuzzle
                        size={(qData.size as number) ?? 3}
                        initialState={qData.initial_state as number[]}
                        onSolve={async () => {
                          if (!room || !me) return;
                          setPuzzleSolved(true);
                          setSubmitted(true);
                          await submitAnswer(room.id, me.id, room.current_round, { answer_data: { solved: true, time: Date.now() }, is_correct: true });
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* ── BLITZ ── */}
                {room.current_mode === 'blitz' && qData.options && (() => {
                  const isLeader = !!(me && me.id === qData.leader_player_id);
                  const opts = (isLeader && qData.leader_options ? qData.leader_options : qData.options) as string[];
                  const correctIdx = isLeader && qData.leader_correct_index !== undefined
                    ? qData.leader_correct_index as number
                    : qData.correct_index as number;
                  return (
                    <div className="flex flex-col gap-4">
                      {isLeader && (
                        <p className="text-yellow-400 font-bold text-center text-sm">👑 Ты лидер — у тебя 3 варианта</p>
                      )}
                      <h2 className="text-xl font-bold text-center text-red-400">{qData.question as string}</h2>
                      <div className="grid grid-cols-2 gap-2">
                        {opts.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => submitChoiceAnswer(i, idx => idx === correctIdx)}
                            className="px-3 py-4 bg-gray-800 border border-red-500/30 hover:border-red-400 hover:bg-red-900/20 rounded-xl font-medium text-center transition-all active:scale-95"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ────────── ROUND RESULTS ────────── */}
        {room.status === 'round_results' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 w-full relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-indigo-600/10 blur-[120px] pointer-events-none rounded-full" />
            
            <h2 className="text-3xl font-black bg-gradient-to-r from-blue-300 via-indigo-400 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(99,102,241,0.6)] uppercase tracking-tight mb-8 relative z-10 animate-in slide-in-from-top-4 duration-500">
              ИТОГИ РАУНДА
            </h2>

            {/* Blitz: too slow message */}
            {me && (room.round_results_data as { blitz_slow_player_id?: string } | null)?.blitz_slow_player_id === me.id && (
              <div className="bg-rose-950/50 border border-rose-500/50 rounded-2xl px-6 py-4 text-center shadow-[0_0_30px_rgba(225,29,72,0.3)] backdrop-blur-md w-full max-w-sm mb-6 animate-in fade-in zoom-in duration-300 relative z-10">
                <p className="text-rose-400 font-black text-xl uppercase flex items-center justify-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                  Слишком медленно!
                </p>
                <p className="text-rose-300/60 text-sm mt-2 font-medium">В блице последний ответ не засчитывается</p>
              </div>
            )}

            {me && room.round_results_data && (
              (() => {
                const myResult = (room.round_results_data.player_results as Array<{ player_id: string; is_correct: boolean; was_first: boolean; position_change: number; new_position: number; lives_change: number; karma_change: number; is_zombie_now: boolean }>)?.find(r => r.player_id === me.id);
                if (!myResult) return <p className="text-gray-400 animate-pulse">Загрузка...</p>;
                
                const isCorrect = myResult.is_correct;

                return (
                  <div className={`w-full max-w-sm flex flex-col items-center p-8 rounded-3xl border backdrop-blur-xl shadow-2xl relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both ${
                    isCorrect 
                      ? 'border-emerald-500/40 bg-emerald-950/30 shadow-[0_0_40px_rgba(16,185,129,0.15)]' 
                      : 'border-rose-500/30 bg-rose-950/20 shadow-[0_0_40px_rgba(225,29,72,0.1)]'
                  }`}>
                    
                    <div className="relative mb-6">
                      <div className={`absolute -inset-4 blur-xl rounded-full opacity-50 ${isCorrect ? 'bg-emerald-500/40' : 'bg-rose-500/30'}`} />
                      <img src={getAvatarUrl(me.avatar, isCorrect ? me.lives : Math.max(0, me.lives - 1))} alt="" className="w-24 h-24 object-contain relative z-10 drop-shadow-2xl" />
                    </div>

                    <div className="text-center mb-6">
                      {isCorrect ? (
                        <div className="text-emerald-400 font-black text-3xl uppercase tracking-wider drop-shadow-md flex flex-col gap-1">
                          <span>{myResult.was_first ? 'ПЕРВЫЙ!' : 'ВЕРНО!'}</span>
                          <span className="text-lg opacity-80">{myResult.was_first ? '+2' : '+1'} ШАГ</span>
                        </div>
                      ) : (
                        <div className="text-rose-400 font-black text-3xl uppercase tracking-wider drop-shadow-md flex flex-col gap-1">
                          <span>НЕВЕРНО</span>
                          <span className="text-lg opacity-80">−❤️ ЖИЗНЬ</span>
                        </div>
                      )}
                    </div>

                    <div className="flex bg-black/40 border border-white/5 rounded-2xl p-4 w-full justify-between items-center mb-4">
                      <span className="text-white/60 font-bold uppercase tracking-wider text-xs">Клетка</span>
                      <div className="flex items-center gap-3 font-mono font-black text-xl">
                        <span className="text-white/40">{me.position}</span>
                        <span className="text-white/30">→</span>
                        <span className="text-white">{myResult.new_position}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 w-full text-center">
                      {myResult.karma_change > 0 && (
                        <div className="bg-amber-950/50 border border-amber-500/50 rounded-xl py-2 px-4 shadow-[0_0_20px_rgba(245,158,11,0.2)] animate-pulse">
                          <span className="text-amber-400 font-black tracking-widest text-sm uppercase">+{myResult.karma_change} ✨ КАРМА</span>
                        </div>
                      )}
                      {myResult.is_zombie_now && !me.is_zombie && (
                        <div className="bg-emerald-950 border border-emerald-500 rounded-xl py-3 px-4 shadow-[0_0_30px_rgba(16,185,129,0.4)] animate-in zoom-in">
                          <span className="text-emerald-400 font-black text-xl uppercase drop-shadow-md flex gap-2 justify-center"><span className="text-2xl">🧟</span> ТЫ СТАЛ ЗОМБИ!</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            )}

            {room.round_results_data?.correct_answer && room.current_mode !== 'mathematician' && (
              <div className="mt-8 bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-4 text-center w-full max-w-sm backdrop-blur-md relative z-10 animate-in fade-in duration-500 delay-300 fill-mode-both flex flex-col gap-1 shadow-lg">
                <span className="text-indigo-300/60 uppercase text-xs font-bold tracking-[0.2em]">Правильный ответ</span>
                <span className="font-black text-emerald-400 text-lg sm:text-xl drop-shadow-[0_0_10px_rgba(52,211,153,0.4)]">
                  {room.round_results_data.correct_answer}
                </span>
              </div>
            )}

          </div>
        )}

        {/* ────────── BET REVEAL ────────── */}
        {room.status === 'bet_reveal' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-3xl font-black">🎰 Итоги ставок</h2>
            {myBet && me && room.bet_results_data && (
              (() => {
                const myBetResult = (room.bet_results_data.bets as Array<{ player_id: string; won: boolean; bet_type: string; bet_option: string }>)?.find(b => b.player_id === me.id);
                if (!myBetResult) return null;
                const optionLabel =
                  myBet.bet_option === 'all_correct' ? '🌟 Все угадают' :
                  myBet.bet_option === 'majority_correct' ? '👥 Большинство угадает' :
                  myBet.bet_option === 'leader_mistake' ? '👑 Ошибка лидера' : '💀 Все ошибутся';
                const stakeLabel = myBet.bet_type === 'life' ? '❤️ Жизнь' : '✨ Карма';
                const wonLabel = myBetResult.won
                  ? myBet.bet_type === 'life' ? '+1 ❤️' : '× 2 ✨'
                  : myBet.bet_type === 'life' ? '−1 ❤️' : '÷ 2 ✨';
                return (
                  <div className={`flex flex-col items-center gap-3 p-6 rounded-2xl border w-full max-w-xs ${
                    myBetResult.won
                      ? 'border-green-500/60 bg-green-900/20 shadow-[0_0_30px_rgba(34,197,94,0.2)]'
                      : 'border-red-500/60 bg-red-900/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
                  }`}>
                    <span className="text-5xl">{myBetResult.won ? '🎉' : '💸'}</span>
                    <span className={`font-black text-2xl ${myBetResult.won ? 'text-green-400' : 'text-red-400'}`}>
                      {myBetResult.won ? 'Ставка сыграла!' : 'Ставка не сыграла'}
                    </span>
                    <span className="text-gray-300 text-sm">{optionLabel}</span>
                    <span className={`font-bold text-lg px-4 py-1 rounded-full ${myBetResult.won ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                      {stakeLabel} → {wonLabel}
                    </span>
                  </div>
                );
              })()
            )}
            {!myBet && <p className="text-gray-500">Вы не делали ставок в этом раунде</p>}
          </div>
        )}

        {/* ────────── DUEL INTRO ────────── */}
        {room.status === 'duel_intro' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <h2 className="text-4xl font-black">⚔️ ДУЭЛЬ!</h2>
            {duel && (
              <div className="flex items-center gap-6">
                {[duel.challenger_id, duel.challenged_id].map(pid => {
                  const p = players.find(x => x.id === pid);
                  if (!p) return null;
                  const isMe = pid === me?.id;
                  return (
                    <div key={pid} className={`flex flex-col items-center gap-2 ${isMe ? 'scale-110' : ''}`}>
                      <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-20 h-20 object-contain" />
                      <span className={`font-bold ${isMe ? 'text-yellow-300' : ''}`}>{p.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {isDuelist ? (
              <p className="text-yellow-400 font-bold animate-pulse">⚔️ Вы участвуете в дуэли!</p>
            ) : (
              <p className="text-gray-400 animate-pulse">
                {duel?.mode === 'minesweeper' ? 'Вы будете расставлять мины...' :
                 duel?.mode === 'arithmetic_mean' ? 'Вы будете вводить число...' :
                 'Вы будете голосовать...'}
              </p>
            )}
          </div>
        )}

        {/* ────────── DUEL SETUP ────────── */}
        {room.status === 'duel_setup' && duel && !isDuelist && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            {duel.mode === 'minesweeper' && (() => {
              const dd = duel.duel_data as { tile_count?: number; mined_tiles?: Record<string, number[]> } | null;
              const myMines = dd?.mined_tiles?.[me?.id ?? ''] ?? [];
              const tileCount = dd?.tile_count ?? 6;
              return (
                <div className="flex flex-col items-center gap-4">
                  <h2 className="text-2xl font-bold">💣 Расставьте мину</h2>
                  <p className="text-gray-400 text-sm">Выберите одну плитку для минирования</p>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: tileCount }).map((_, i) => {
                      const mined = myMines.includes(i);
                      return (
                        <button key={i} onClick={() => handleMinePlacement(i)} disabled={mined || myMines.length >= 1}
                          className={`w-16 h-16 rounded-xl font-bold text-xl transition-all ${
                            mined ? 'bg-red-800 border border-red-500 text-red-300' :
                            myMines.length >= 1 ? 'bg-gray-700 opacity-50 cursor-not-allowed' :
                            'bg-gray-700 hover:bg-gray-600 border border-gray-500 active:scale-95'
                          }`}>
                          {mined ? '💣' : i + 1}
                        </button>
                      );
                    })}
                  </div>
                  {myMines.length >= 1 && <p className="text-green-400 font-bold">✅ Мина расставлена! Ждите начала дуэли.</p>}
                </div>
              );
            })()}

            {duel.mode === 'crowd_forecast' && (() => {
              const dd = duel.duel_data as { question?: string; options?: string[]; player_votes?: Record<string, number> } | null;
              const voted = dd?.player_votes?.[me?.id ?? ''] != null;
              return (
                <div className="flex flex-col items-center gap-4">
                  <h2 className="text-2xl font-bold">🗳️ Ваш голос</h2>
                  <p className="text-gray-300 text-center">{dd?.question}</p>
                  {voted ? (
                    <p className="text-green-400 font-bold">✅ Голос принят!</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
                      {(dd?.options ?? []).map((opt, i) => (
                        <button key={i} onClick={() => handleCrowdVote(i)}
                          className="px-4 py-3 bg-gray-800 border border-gray-600 hover:border-purple-500 rounded-xl active:scale-95">
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {duel.mode === 'arithmetic_mean' && (() => {
              const dd = duel.duel_data as { question?: string; player_guesses?: Record<string, number> } | null;
              const guessed = dd?.player_guesses?.[me?.id ?? ''] != null;
              return (
                <div className="flex flex-col items-center gap-4">
                  <h2 className="text-2xl font-bold">📊 Введите число</h2>
                  <p className="text-gray-300 text-center">{dd?.question}</p>
                  {guessed ? (
                    <p className="text-green-400 font-bold">✅ Число введено! Дуэлянты угадывают среднее.</p>
                  ) : (
                    <div className="flex gap-2">
                      <input type="number" value={arithmeticInput} onChange={e => setArithmeticInput(e.target.value)}
                        className="w-32 text-center text-xl bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white outline-none focus:border-blue-500"
                        autoFocus />
                      <button onClick={() => { handleCrowdGuess(parseInt(arithmeticInput, 10)); setArithmeticInput(''); }}
                        disabled={!arithmeticInput}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold disabled:opacity-40">OK</button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Duel setup (duelists see waiting screen) ── */}
        {room.status === 'duel_setup' && isDuelist && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-2xl font-bold">⚔️ Вы дуэлянт!</h2>
            <p className="text-gray-400">Остальные подготавливают поле...</p>
            <p className="text-gray-500 animate-pulse">Ожидайте начала дуэли</p>
          </div>
        )}

        {/* ────────── DUEL PLAYING ────────── */}
        {room.status === 'duel_playing' && isDuelist && duel && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-2xl font-bold">⚔️ Ваш ход!</h2>

            {duel.mode === 'minesweeper' && (() => {
              const dd = duel.duel_data as { tile_count?: number; mined_tiles?: Record<string, number[]>; challenger_picks?: number[]; challenged_picks?: number[] } | null;
              const isChallenger = duel.challenger_id === me?.id;
              const myPicks = isChallenger ? (dd?.challenger_picks ?? []) : (dd?.challenged_picks ?? []);
              const tileCount = dd?.tile_count ?? 6;
              const submitted_ = myPicks.length > 0;
              return (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-gray-300 text-sm">Выберите плитку — под одной из них мина!</p>
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: tileCount }).map((_, i) => {
                      const picked = myPicks.includes(i);
                      return (
                        <button key={i} onClick={() => !submitted_ && handleDuelPickTile(i)}
                          className={`w-20 h-20 rounded-xl font-bold text-2xl transition-all ${
                            picked ? 'bg-yellow-800 border border-yellow-500' :
                            submitted_ ? 'opacity-50 cursor-not-allowed bg-gray-800' :
                            'bg-gray-700 hover:bg-gray-600 border border-gray-500 active:scale-90'
                          }`}>
                          {picked ? '🤞' : '?'}
                        </button>
                      );
                    })}
                  </div>
                  {submitted_ && <p className="text-gray-400 animate-pulse">Ждите результата...</p>}
                </div>
              );
            })()}

            {duel.mode === 'arithmetic_mean' && (() => {
              const dd = duel.duel_data as { question?: string; average?: number | null; challenger_answer?: number | null; challenged_answer?: number | null } | null;
              const isChallenger = duel.challenger_id === me?.id;
              const myAns = isChallenger ? dd?.challenger_answer : dd?.challenged_answer;
              const avg = dd?.average;
              return (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-gray-300 text-center">{dd?.question}</p>
                  {myAns == null ? (
                    <div className="flex gap-2">
                      <input type="number" value={arithmeticInput} onChange={e => setArithmeticInput(e.target.value)}
                        className="w-36 text-center text-xl bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white outline-none"
                        autoFocus />
                      <button onClick={() => { handleDuelArithmeticAnswer(parseFloat(arithmeticInput)); setArithmeticInput(''); }}
                        disabled={!arithmeticInput}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold disabled:opacity-40">OK</button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      {avg != null && <p className="text-blue-400 font-bold text-2xl">Среднее: {avg.toFixed(2)}</p>}
                      <p className="text-green-400">✅ Ваш ответ: {myAns}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {duel.mode === 'crowd_forecast' && (() => {
              const dd = duel.duel_data as { question?: string; options?: string[]; challenger_prediction?: number | null; challenged_prediction?: number | null } | null;
              const isChallenger = duel.challenger_id === me?.id;
              const myPred = isChallenger ? dd?.challenger_prediction : dd?.challenged_prediction;
              return (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-gray-300 text-center">{dd?.question}</p>
                  <p className="text-gray-400 text-sm">Какой вариант выберет большинство?</p>
                  {myPred == null ? (
                    <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
                      {(dd?.options ?? []).map((opt, i) => (
                        <button key={i} onClick={() => handleDuelCrowdPrediction(i)}
                          className="px-4 py-3 bg-gray-800 border border-gray-600 hover:border-yellow-500 rounded-xl active:scale-95">
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-green-400">✅ Ваш прогноз отправлен</p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Non-duelists watching duel play ── */}
        {room.status === 'duel_playing' && !isDuelist && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-2xl font-bold">⚔️ Дуэль идёт!</h2>
            {duel && (
              <div className="flex gap-6">
                {[duel.challenger_id, duel.challenged_id].map(pid => {
                  const p = players.find(x => x.id === pid);
                  if (!p) return null;
                  return (
                    <div key={pid} className="flex flex-col items-center gap-2">
                      <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-16 h-16 object-contain" />
                      <span className="font-bold text-sm">{p.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-gray-500 animate-pulse">Смотрите на экран ведущего</p>
          </div>
        )}

        {/* ────────── DUEL RESULT ────────── */}
        {room.status === 'duel_result' && duel && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-3xl font-black">⚔️ Итог дуэли</h2>
            {duel.winner_id ? (
              (() => {
                const w = players.find(p => p.id === duel.winner_id);
                const isMe_ = duel.winner_id === me?.id;
                return (
                  <div className="flex flex-col items-center gap-2">
                    {w && <img src={getAvatarUrl(w.avatar, w.lives)} alt="" className="w-20 h-20 object-contain" />}
                    <span className={`text-2xl font-black ${isMe_ ? 'text-yellow-400' : 'text-white'}`}>
                      {isMe_ ? '🏆 Вы победили!' : `🏆 Победил ${w?.name}`}
                    </span>
                  </div>
                );
              })()
            ) : (
              <span className="text-xl text-gray-400">🤝 Ничья</span>
            )}
          </div>
        )}

        {/* ────────── HOT POTATO ────────── */}
        {room.status === 'potato_intro' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-600 via-red-950 to-black text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-orange-500/20 blur-[100px] rounded-full pointer-events-none"></div>

            <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 via-orange-500 to-red-600 drop-shadow-[0_0_20px_rgba(234,88,12,0.8)] animate-pulse tracking-tighter uppercase leading-none mb-8 relative z-10">
              ГОРЯЧАЯ<br/>КАРТОШКА!
            </h2>
            <div className="text-xl text-gray-200 mb-8 max-w-sm space-y-4 border border-orange-500/20 bg-black/30 backdrop-blur p-6 rounded-3xl shadow-xl relative z-10">
              <p>Все выжившие ответили верно!</p>
              <p>Придётся кому-то взять удар на себя.</p>
            </div>
            
            <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-orange-500/30 p-6 rounded-[2rem] mb-10 w-full max-w-sm relative z-10 shadow-[0_0_30px_rgba(234,88,12,0.2)]">
              <p className="text-3xl font-black text-white text-center tracking-tight mb-2">ТРЯСИ ТЕЛЕФОН</p>
              <p className="text-orange-300 font-medium opacity-80 text-center">или жми кнопку,<br/>чтобы перекинуть бомбу!</p>
            </div>

            <button 
              onClick={async () => {
                if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
                  try {
                    await (DeviceMotionEvent as any).requestPermission();
                  } catch(e) {
                    console.error(e);
                  }
                }
              }} 
              className="w-full max-w-xs py-5 bg-gradient-to-b from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 rounded-full text-2xl font-black text-white shadow-[0_0_40px_rgba(234,88,12,0.6)] active:scale-95 transition-all outline-none border-b-4 border-red-800 relative z-10 tracking-widest uppercase"
            >
              ПОНЯЛ
            </button>
          </div>
        )}

        {room.status === 'potato_playing' && (() => {
          const rd = room.round_results_data as any;
          const holderId = rd?.potato_bomb_holder;
          const imHolder = holderId === me?.id;
          const imDead = me?.is_zombie ?? false;
          const taskIdx = (rd?.potato_task ?? 0) as number;

          // Task definitions: text shown + gesture hint
          const TASKS = [
            { label: 'ВСТРЯХНИ ТЕЛЕФОН!', hint: '3 раза', gesture: 'shake' },
            { label: 'СВАЙПНИ ВПРАВО', hint: '3 раза по экрану', gesture: 'swipe_right' },
            { label: 'НАЖМИ 5 РАЗ', hint: 'быстро по кнопке ниже', gesture: 'tap5' },
          ] as const;
          const task = TASKS[taskIdx % TASKS.length];

          // Tap-5 counter handler (gesture: tap5)
          const handleTap5 = () => {
            gestureCountRef.current += 1;
            if (gestureCountRef.current >= 5) {
              gestureCountRef.current = 0;
              handlePotatoPass();
            }
          };

          return (
            <div className={`flex-1 flex flex-col items-center justify-center p-8 transition-colors duration-700 relative overflow-hidden ${imHolder ? 'bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-800 via-red-950 to-black' : 'bg-gray-950'}`}>
              
              {/* ImDead view */}
              {imDead ? (
                <div className="relative z-10 flex flex-col items-center gap-6">
                  <div className="text-6xl grayscale opacity-30">🧟</div>
                  <h2 className="text-3xl font-black text-gray-500 text-center uppercase tracking-wide px-8">
                    Зомби не боятся бомб
                  </h2>
                </div>
              ) 
              
              /* Bomb Holder View */
              : imHolder ? (
                <>
                  <div className="absolute inset-0 bg-red-600/20 animate-ping pointer-events-none mix-blend-screen" style={{ animationDuration: '0.4s' }} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none relative z-10"></div>
                  
                  <div className="relative z-20 flex flex-col items-center w-full max-w-sm">
                    <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-red-300 drop-shadow-[0_0_30px_rgba(239,68,68,1)] animate-shake tracking-tighter uppercase text-center mb-8">
                      БОМБА У ТЕБЯ!
                    </h2>
                    
                    <div
                      className="relative mb-10"
                      onTouchStart={e => { touchStartXRef.current = e.touches[0].clientX; }}
                      onTouchEnd={e => {
                        if (task.gesture === 'swipe_right') {
                          const dx = e.changedTouches[0].clientX - touchStartXRef.current;
                          if (dx > 60) {
                            gestureCountRef.current += 1;
                            if (gestureCountRef.current >= 3) {
                              gestureCountRef.current = 0;
                              handlePotatoPass();
                            }
                          }
                        }
                      }}
                    >
                      <div className="absolute inset-0 bg-red-600 blur-[50px] opacity-60 rounded-full animate-pulse"></div>
                      <div className="text-9xl animate-bounce drop-shadow-[0_0_40px_rgba(255,255,255,0.6)] filter contrast-125 saturate-150 relative z-10 select-none">💣</div>
                    </div>
                    
                    <div className="bg-black/40 border border-red-500/30 rounded-3xl p-5 backdrop-blur w-full mb-6 shadow-2xl">
                      <p className="text-2xl font-black text-orange-300 text-center tracking-tight uppercase">
                        {task.label}
                      </p>
                      <p className="text-red-400/80 font-semibold text-center mt-1 text-sm uppercase">{task.hint}</p>
                    </div>

                    {task.gesture === 'tap5' ? (
                      <button
                        onClick={handleTap5}
                        className="w-full py-6 bg-gradient-to-b from-orange-500 to-red-700 rounded-full text-3xl font-black text-white shadow-[0_0_60px_rgba(239,68,68,0.8)] active:scale-95 transition-all border-b-[6px] border-red-950 uppercase tracking-widest"
                      >
                        ТАП! 👊
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePotatoPass()}
                        className="w-full py-6 bg-gradient-to-b from-red-500 to-red-800 rounded-full text-3xl font-black text-white shadow-[0_0_60px_rgba(239,68,68,0.8)] active:scale-95 transition-all border-b-[6px] border-red-950 uppercase tracking-widest"
                      >
                        ПЕРЕКИНУТЬ
                      </button>
                    )}
                  </div>
                </>
              ) 
              
              /* Idle Player View */
              : (
                <div className="relative z-10 flex flex-col items-center gap-10">
                  <div className="relative">
                    <div className="text-8xl grayscale opacity-30 drop-shadow-xl saturate-0">💣</div>
                  </div>
                  <div className="bg-gray-900/50 border border-gray-800 p-8 rounded-[2rem] text-center w-full max-w-sm backdrop-blur-sm">
                    <h2 className="text-3xl font-black text-gray-400 tracking-tight uppercase leading-snug">
                      Бомба не у тебя.
                    </h2>
                    <p className="text-xl text-green-500/70 font-semibold mt-4 animate-pulse">
                      Молись! 🙏
                    </p>
                  </div>
                  {holderId && (
                    <p className="text-lg text-gray-600 font-medium uppercase tracking-widest text-center mt-4">
                      Следи на экране
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {room.status === 'potato_result' && (() => {
          const rd = room.round_results_data as any;
          const loserId = rd?.potato_loser;
          const imLoser = loserId === me?.id;

          return (
            <div className={`flex-1 flex flex-col items-center justify-center p-8 transition-colors duration-1000 relative overflow-hidden ${imLoser ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900 via-black to-black' : 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-900/20 via-black to-black'}`}>
              
              {imLoser && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-red-600/30 blur-[100px] rounded-full pointer-events-none mix-blend-screen"></div>}
              
              <h2 className={`text-6xl font-black text-center mb-10 tracking-tighter uppercase relative z-10 ${imLoser ? 'text-transparent bg-clip-text bg-gradient-to-b from-white to-red-600 drop-shadow-[0_0_30px_rgba(239,68,68,1)] animate-shake' : 'text-gray-600'}`}>
                💥 БАБАХ! 💥
              </h2>
              
              <div className={`relative z-10 p-8 rounded-[2rem] text-center w-full max-w-sm backdrop-blur-md border ${imLoser ? 'bg-red-950/40 border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.4)]' : 'bg-gray-900/40 border-gray-800'}`}>
                {imLoser ? (
                  <div className="flex flex-col gap-4">
                    <p className="text-4xl font-black text-white uppercase tracking-tight">
                      Ты взорвался!
                    </p>
                    <div className="mx-auto bg-red-500/20 border border-red-500 text-red-400 py-3 px-6 rounded-full inline-block">
                      <span className="text-2xl font-black tracking-widest">-1 ЖИЗНЬ</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-3xl font-black text-gray-300 uppercase tracking-tight">
                      Тебя пронесло
                    </p>
                    <p className="text-green-500/80 font-bold text-xl uppercase mt-2">Фух 😮‍💨</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ────────── BLITZ INTRO ────────── */}
        {room.status === 'blitz_intro' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 bg-gradient-to-b from-gray-950 to-red-950">
            <h2 className="text-5xl font-black text-red-400 animate-pulse">⚡ БЛИЦ!</h2>
            <p className="text-gray-300 text-center max-w-xs">Быстрые вопросы! Правильный ответ → +1 клетка. Последний штрафуется!</p>
          </div>
        )}

        {/* ────────── BLITZ PLAYING (same as round_playing/blitz) ────────── */}
        {room.status === 'blitz_playing' && qData && (
          <div className="flex-1 flex flex-col p-4 gap-4 bg-gradient-to-b from-gray-950 to-red-950/20">
            {submitted ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <div className="text-4xl">{choiceAnswer === qData.correct_index ? '✅' : '❌'}</div>
                <p className="text-gray-400 animate-pulse">Ждите следующего вопроса...</p>
              </div>
            ) : (
              <>
                <p className="text-red-400 font-bold text-center">⚡ Раунд {room.current_round}</p>
                <h2 className="text-xl font-bold text-center">{qData.question as string}</h2>
                <div className="grid grid-cols-2 gap-2">
                  {(qData.options as string[]).map((opt, i) => (
                    <button key={i}
                      onClick={() => submitChoiceAnswer(i, idx => idx === (qData.correct_index as number))}
                      className="px-3 py-4 bg-gray-800 border border-red-500/30 hover:border-red-400 hover:bg-red-900/20 rounded-xl font-medium text-center active:scale-95">
                      {opt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ────────── FINISHED ────────── */}
        {room.status === 'finished' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <h1 className="text-5xl font-black">🏆 Финиш!</h1>
            {me && (
              <div className="flex flex-col items-center gap-2">
                <img src={getAvatarUrl(me.avatar, me.lives)} alt="" className="w-20 h-20 object-contain" />
                <span className="font-bold text-xl">{me.name}</span>
                <span className="text-gray-400">Клетка {me.position} · {me.lives}❤️ · {me.karma}✨</span>
              </div>
            )}
            <div className="w-full max-w-xs space-y-2">
              {players.filter(p => !p.is_host).sort((a, b) => b.position - a.position).map((p, i) => (
                <div key={p.id} className={`flex items-center gap-3 p-2 rounded-xl ${p.id === me?.id ? 'bg-yellow-900/20 border border-yellow-500/50' : 'bg-gray-900'}`}>
                  <span>{['🥇','🥈','🥉'][i] ?? `#${i+1}`}</span>
                  <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-8 h-8 object-contain" />
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-gray-400 text-sm">кл.{p.position}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showPersistentDuelPanel && me && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-50 w-[calc(100%-1rem)] max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="rounded-2xl p-4 flex flex-col items-center gap-3 backdrop-blur-md bg-amber-950/85 border border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.25)]">
              <p className="font-black text-sm uppercase tracking-wide flex items-center gap-2 text-amber-300">
                <span className="animate-pulse">⚔️</span> Вызов на дуэль
              </p>
              <p className="text-xs text-center text-amber-200/70">Панель доступна до начала активных игровых действий</p>
              {duelTargets.length === 1 ? (
                <button
                  onClick={() => handleInitiateDuelChallenge(duelTargets[0].id)}
                  disabled={duelChallenging}
                  className="px-5 py-3 active:scale-95 rounded-xl font-black flex items-center gap-2 disabled:opacity-50 transition-all bg-amber-600 hover:bg-amber-500"
                >
                  <img src={getAvatarUrl(duelTargets[0].avatar, duelTargets[0].lives)} alt="" className="w-8 h-8 object-contain" />
                  <span>⚔️ Вызвать {duelTargets[0].name}</span>
                  <span className="text-xs opacity-70 ml-1">−3 ✨</span>
                </button>
              ) : (
                <div className="flex flex-col gap-2 w-full max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {duelTargets.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleInitiateDuelChallenge(t.id)}
                      disabled={duelChallenging}
                      className="px-4 py-3 active:scale-95 rounded-xl font-bold flex items-center gap-3 disabled:opacity-50 transition-all bg-amber-700 hover:bg-amber-600"
                    >
                      <img src={getAvatarUrl(t.avatar, t.lives)} alt="" className="w-8 h-8 object-contain" />
                      <span>⚔️ Вызвать {t.name}</span>
                      <span className="ml-auto text-xs opacity-70">−3 ✨</span>
                    </button>
                  ))}
                </div>
              )}
              {duelChallenging && <p className="text-xs animate-pulse text-amber-400">⏳ Инициируем дуэль...</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
